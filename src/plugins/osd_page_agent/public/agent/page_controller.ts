/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Adapted from page-agent/packages/page-controller/src/PageController.ts
 *
 * Modifications:
 * - Removed all @page-agent/* imports
 * - Import types from '../../common/types' (FlatDomTree, InteractiveElementDomNode, BrowserState, ActionResult)
 * - Import DOM functions from './dom'
 * - Import getPageInfo from './dom/get_page_info'
 * - Import action functions from './actions'
 * - Import isAnchorElement from './utils'
 * - Removed SimulatorMask import and ALL mask-related code (OSD chrome provides separation)
 * - Removed patchReact import (patching called from plugin init)
 * - Removed PageControllerConfig.enableMask field
 * - Kept everything else as-is: getBrowserState(), updateTree(), clickElement(), inputText(),
 *   selectOption(), scroll(), scrollHorizontally(), executeJavascript(), cleanUpHighlights(), dispose()
 * - Kept EventTarget extension and beforeUpdate/afterUpdate events
 */

import {
  clickElement as clickElementAction,
  getElementByIndex,
  inputTextElement,
  scrollHorizontally as scrollHorizontallyAction,
  scrollVertically,
  selectOptionElement,
} from './actions';
import * as dom from './dom';
import type {
  FlatDomTree,
  InteractiveElementDomNode,
  BrowserState,
  ActionResult,
} from '../../common/types';
import { getPageInfo } from './dom/get_page_info';
import { isAnchorElement } from './utils';

/**
 * Configuration for PageController.
 * Extends DomConfig with any PageController-specific options.
 */
export type PageControllerConfig = dom.DomConfig;

/**
 * PageController manages DOM state and element interactions.
 * It provides async methods for all DOM operations, keeping state isolated.
 *
 * @lifecycle
 * - beforeUpdate: Emitted before the DOM tree is updated.
 * - afterUpdate: Emitted after the DOM tree is updated.
 */
export class PageController extends EventTarget {
  private config: PageControllerConfig;

  /** Corresponds to eval_page in browser-use */
  private flatTree: FlatDomTree | null = null;

  /**
   * All highlighted index-mapped interactive elements.
   * Corresponds to DOMState.selector_map in browser-use.
   */
  private selectorMap = new Map<number, InteractiveElementDomNode>();

  /** Index -> element text description mapping */
  private elementTextMap = new Map<number, string>();

  /**
   * Simplified HTML for LLM consumption.
   * Corresponds to clickable_elements_to_string in browser-use.
   */
  private simplifiedHTML = '<EMPTY>';

  /** Last time the tree was updated */
  private lastTimeUpdate = 0;

  /** Whether the tree has been indexed at least once */
  private isIndexed = false;

  constructor(config: PageControllerConfig = {}) {
    super();
    this.config = config;
    // Note: patchReact() is called from plugin init, not here
  }

  // ======= State Queries =======

  /**
   * Get current page URL
   */
  async getCurrentUrl(): Promise<string> {
    return window.location.href;
  }

  /**
   * Get last tree update timestamp
   */
  async getLastUpdateTime(): Promise<number> {
    return this.lastTimeUpdate;
  }

  /**
   * Get structured browser state for LLM consumption.
   * Automatically calls updateTree() to refresh the DOM state.
   */
  async getBrowserState(): Promise<BrowserState> {
    const url = window.location.href;
    const title = document.title;
    const pi = getPageInfo();
    const viewportExpansion = dom.resolveViewportExpansion(this.config.viewportExpansion);

    await this.updateTree();

    const content = this.simplifiedHTML;

    // Build header: page info + scroll position hint
    const titleLine = `Current Page: [${title}](${url})`;

    const pageInfoLine = `Page info: ${pi.viewport_width}x${pi.viewport_height}px viewport, ${
      pi.page_width
    }x${pi.page_height}px total page size, ${pi.pages_above.toFixed(
      1
    )} pages above, ${pi.pages_below.toFixed(1)} pages below, ${pi.total_pages.toFixed(
      1
    )} total pages, at ${(pi.current_page_position * 100).toFixed(0)}% of page`;

    const elementsLabel =
      viewportExpansion === -1
        ? 'Interactive elements from top layer of the current page (full page):'
        : 'Interactive elements from top layer of the current page inside the viewport:';

    const hasContentAbove = pi.pixels_above > 4;
    const scrollHintAbove =
      hasContentAbove && viewportExpansion !== -1
        ? `... ${pi.pixels_above} pixels above (${pi.pages_above.toFixed(
            1
          )} pages) - scroll to see more ...`
        : '[Start of page]';

    const header = `${titleLine}\n${pageInfoLine}\n\n${elementsLabel}\n\n${scrollHintAbove}`;

    // Build footer: scroll position hint
    const hasContentBelow = pi.pixels_below > 4;
    const footer =
      hasContentBelow && viewportExpansion !== -1
        ? `... ${pi.pixels_below} pixels below (${pi.pages_below.toFixed(
            1
          )} pages) - scroll to see more ...`
        : '[End of page]';

    return { url, title, header, content, footer };
  }

  // ======= DOM Tree Operations =======

  /**
   * Update DOM tree, returns simplified HTML for LLM.
   * This is the main method to refresh the page state.
   */
  async updateTree(): Promise<string> {
    this.dispatchEvent(new Event('beforeUpdate'));

    this.lastTimeUpdate = Date.now();

    dom.cleanUpHighlights();

    const blacklist = [
      ...(this.config.interactiveBlacklist || []),
      ...Array.from(document.querySelectorAll('[data-page-agent-not-interactive]')),
    ];

    this.flatTree = dom.getFlatTree({
      ...this.config,
      interactiveBlacklist: blacklist,
    });

    this.simplifiedHTML = dom.flatTreeToString(this.flatTree, this.config.includeAttributes);

    this.selectorMap.clear();
    this.selectorMap = dom.getSelectorMap(this.flatTree);

    this.elementTextMap.clear();
    this.elementTextMap = dom.getElementTextMap(this.simplifiedHTML);

    // Mark as indexed - now element actions are allowed
    this.isIndexed = true;

    this.dispatchEvent(new Event('afterUpdate'));

    return this.simplifiedHTML;
  }

  /**
   * Clean up all element highlights
   */
  async cleanUpHighlights(): Promise<void> {
    dom.cleanUpHighlights();
  }

  // ======= Element Actions =======

  /**
   * Ensure the tree has been indexed before any index-based operation.
   * Throws if updateTree() hasn't been called yet.
   */
  private assertIndexed(): void {
    if (!this.isIndexed) {
      throw new Error('DOM tree not indexed yet. Can not perform actions on elements.');
    }
  }

  /**
   * Briefly flash an emphasis overlay on the element at the given index.
   * The overlay appears above the existing highlight (z-index 2147483641)
   * but below the Agent Panel flyout and OSD chrome modals.
   * It fades out over ~400ms and removes itself automatically.
   */
  private emphasizeElement(index: number): void {
    try {
      const node = this.selectorMap.get(index);
      if (!node?.ref) return;

      const rects = node.ref.getClientRects();
      if (!rects || rects.length === 0) return;

      const rect = rects[0];
      if (rect.width === 0 || rect.height === 0) return;

      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.border = '3px solid #FFD700';
      overlay.style.backgroundColor = 'rgba(255, 215, 0, 0.25)';
      overlay.style.borderRadius = '3px';
      overlay.style.pointerEvents = 'none';
      overlay.style.boxSizing = 'border-box';
      // Above highlight container (2147483640) but below OSD chrome modals
      overlay.style.zIndex = '2147483641';
      overlay.style.transition = 'opacity 0.3s ease-out';
      overlay.style.opacity = '1';

      document.body.appendChild(overlay);

      // Start fade-out after a brief visible period
      requestAnimationFrame(() => {
        setTimeout(() => {
          overlay.style.opacity = '0';
          setTimeout(() => overlay.remove(), 300);
        }, 150);
      });
    } catch {
      // Non-critical — don't let emphasis errors affect action execution
    }
  }

  /**
   * Click element by index
   */
  async clickElement(index: number): Promise<ActionResult> {
    try {
      this.assertIndexed();
      const element = getElementByIndex(this.selectorMap, index);
      const elemText = this.elementTextMap.get(index);
      this.emphasizeElement(index);
      await clickElementAction(element);

      // Handle links that open in new tabs
      if (isAnchorElement(element) && element.target === '_blank') {
        return {
          success: true,
          message: `✅ Clicked element (${elemText ?? index}). ⚠️ Link opened in a new tab.`,
        };
      }

      return {
        success: true,
        message: `✅ Clicked element (${elemText ?? index}).`,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Failed to click element: ${error}`,
      };
    }
  }

  /**
   * Input text into element by index
   */
  async inputText(index: number, text: string): Promise<ActionResult> {
    try {
      this.assertIndexed();
      const element = getElementByIndex(this.selectorMap, index);
      const elemText = this.elementTextMap.get(index);
      this.emphasizeElement(index);
      await inputTextElement(element, text);

      return {
        success: true,
        message: `✅ Input text (${text}) into element (${elemText ?? index}).`,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Failed to input text: ${error}`,
      };
    }
  }

  /**
   * Select dropdown option by index and option text
   */
  async selectOption(index: number, optionText: string): Promise<ActionResult> {
    try {
      this.assertIndexed();
      const element = getElementByIndex(this.selectorMap, index);
      const elemText = this.elementTextMap.get(index);
      this.emphasizeElement(index);
      await selectOptionElement(element as HTMLSelectElement, optionText);

      return {
        success: true,
        message: `✅ Selected option (${optionText}) in element (${elemText ?? index}).`,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Failed to select option: ${error}`,
      };
    }
  }

  /**
   * Scroll vertically
   */
  async scroll(options: {
    down: boolean;
    numPages: number;
    pixels?: number;
    index?: number;
  }): Promise<ActionResult> {
    try {
      const { down, numPages, pixels, index } = options;

      this.assertIndexed();

      const scrollAmount = pixels ?? numPages * (down ? 1 : -1) * window.innerHeight;

      const element = index !== undefined ? getElementByIndex(this.selectorMap, index) : null;

      const message = await scrollVertically(down, scrollAmount, element);

      return {
        success: true,
        message,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Failed to scroll: ${error}`,
      };
    }
  }

  /**
   * Scroll horizontally
   */
  async scrollHorizontally(options: {
    right: boolean;
    pixels: number;
    index?: number;
  }): Promise<ActionResult> {
    try {
      const { right, pixels, index } = options;

      this.assertIndexed();

      const scrollAmount = pixels * (right ? 1 : -1);

      const element = index !== undefined ? getElementByIndex(this.selectorMap, index) : null;

      const message = await scrollHorizontallyAction(right, scrollAmount, element);

      return {
        success: true,
        message,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Failed to scroll horizontally: ${error}`,
      };
    }
  }

  /**
   * Execute arbitrary JavaScript on the page
   */
  async executeJavascript(script: string): Promise<ActionResult> {
    try {
      // Wrap script in async function to support await
      // eslint-disable-next-line no-eval
      const asyncFunction = eval(`(async () => { ${script} })`);
      const result = await asyncFunction();
      return {
        success: true,
        message: `✅ Executed JavaScript. Result: ${result}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Error executing JavaScript: ${error}`,
      };
    }
  }

  /**
   * Dispose and clean up resources
   */
  dispose(): void {
    dom.cleanUpHighlights();
    this.flatTree = null;
    this.selectorMap.clear();
    this.elementTextMap.clear();
    this.simplifiedHTML = '<EMPTY>';
    this.isIndexed = false;
  }
}

export * from './actions';
