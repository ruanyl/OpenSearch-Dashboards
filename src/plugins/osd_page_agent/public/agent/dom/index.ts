/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 *
 * Adapted from page-agent/packages/page-controller/src/dom/index.ts
 *
 * Modifications:
 * - Replaced `import domTree from './dom_tree/index.js'` with `import domTree from './dom_tree'`
 * - Replaced dom_tree/type imports with imports from '../../../common/types'
 * - Added Apache-2.0 license header
 * - All functions preserved as-is: resolveViewportExpansion, getFlatTree, flatTreeToString,
 *   getAllTextTillNextClickableElement, getSelectorMap, getElementTextMap, cleanUpHighlights
 * - URL change listeners preserved at the bottom
 */

import domTree from './dom_tree';
import {
  ElementDomNode,
  FlatDomTree,
  InteractiveElementDomNode,
  TextDomNode,
} from '../../../common/types';

/**
 * Viewport expansion for DOM tree extraction.
 * -1 means full page (no viewport restriction)
 * 0 means viewport only
 * positive values expand the viewport by that many pixels
 *
 * @note Since isTopElement depends on elementFromPoint,
 * it returns null when out of viewport, this feature has no practical use, only differ between -1 and 0
 */
const DEFAULT_VIEWPORT_EXPANSION = -1;

export function resolveViewportExpansion(viewportExpansion?: number): number {
  return viewportExpansion ?? DEFAULT_VIEWPORT_EXPANSION;
}

export interface DomConfig {
  viewportExpansion?: number;
  interactiveBlacklist?: Array<Element | (() => Element)>;
  interactiveWhitelist?: Array<Element | (() => Element)>;
  includeAttributes?: string[];
  highlightOpacity?: number;
  highlightLabelOpacity?: number;
}

/**
 * Cache for detecting newly appeared interactive elements.
 */
const newElementsCache = new WeakMap<HTMLElement, string>();

export function getFlatTree(config: DomConfig): FlatDomTree {
  const viewportExpansion = resolveViewportExpansion(config.viewportExpansion);

  const interactiveBlacklist = [] as Element[];
  for (const item of config.interactiveBlacklist || []) {
    if (typeof item === 'function') {
      interactiveBlacklist.push(item());
    } else {
      interactiveBlacklist.push(item);
    }
  }

  const interactiveWhitelist = [] as Element[];
  for (const item of config.interactiveWhitelist || []) {
    if (typeof item === 'function') {
      interactiveWhitelist.push(item());
    } else {
      interactiveWhitelist.push(item);
    }
  }

  const elements = domTree({
    doHighlightElements: true,
    debugMode: true,
    focusHighlightIndex: -1,
    viewportExpansion,
    interactiveBlacklist,
    interactiveWhitelist,
    highlightOpacity: config.highlightOpacity ?? 0.0,
    highlightLabelOpacity: config.highlightLabelOpacity ?? 0.1,
  }) as FlatDomTree;

  const currentUrl = window.location.href;

  /**
   * Mark newly appeared elements.
   * Elements not yet in the cache get isNew = true, which renders as *[index] in the output
   * (tells the LLM "this element just appeared").
   */
  for (const nodeId in elements.map) {
    if (elements.map.hasOwnProperty(nodeId)) {
      const node = elements.map[nodeId];
      if (node.isInteractive && (node as InteractiveElementDomNode).ref) {
        const ref = (node as InteractiveElementDomNode).ref as HTMLElement;
        if (!newElementsCache.has(ref)) {
          newElementsCache.set(ref, currentUrl);
          (node as any).isNew = true;
        }
      }
    }
  }

  return elements;
}

const globRegexCache = new Map<string, RegExp>();

function globToRegex(pattern: string): RegExp {
  let regex = globRegexCache.get(pattern);
  if (!regex) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
    globRegexCache.set(pattern, regex);
  }
  return regex;
}

function matchAttributes(
  attrs: Record<string, string>,
  patterns: string[]
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      const regex = globToRegex(pattern);
      for (const key of Object.keys(attrs)) {
        if (regex.test(key) && attrs[key].trim()) {
          result[key] = attrs[key].trim();
        }
      }
    } else {
      const value = attrs[pattern];
      if (value && value.trim()) {
        result[pattern] = value.trim();
      }
    }
  }

  return result;
}

/**
 * Internal tree node type used by flatTreeToString.
 */
interface TreeNode {
  type: 'text' | 'element';
  parent: TreeNode | null;
  children: TreeNode[];
  isVisible: boolean;
  // Text node properties
  text?: string;
  // Element node properties
  tagName?: string;
  attributes?: Record<string, string>;
  isInteractive?: boolean;
  isTopElement?: boolean;
  isNew?: boolean;
  highlightIndex?: number;
  extra?: Record<string, any>;
}

/**
 * Convert a flat DOM tree into a simplified text format suitable for LLM consumption.
 *
 * Interactive elements are formatted as: [index]<tagName attr=val>text />
 * New elements (first appearance) are marked as: *[index]<tagName ...>text />
 * Tab indentation reflects DOM parent-child hierarchy.
 * Non-interactive text nodes are shown only if parent is visible and a top element.
 */
export function flatTreeToString(flatTree: FlatDomTree, includeAttributes?: string[]): string {
  const DEFAULT_INCLUDE_ATTRIBUTES = [
    'title',
    'type',
    'checked',
    'name',
    'role',
    'value',
    'placeholder',
    'data-date-format',
    'alt',
    'aria-label',
    'aria-expanded',
    'data-state',
    'aria-checked',
    // added for better form handling
    'id',
    'for',
    // for jump check
    'target',
    // absolute position dropdown menu
    'aria-haspopup',
    'aria-controls',
    'aria-owns',
    // content editable
    'contenteditable',
    // OSD component identifiers — provides semantic context for the LLM
    'data-test-subj',
  ];

  const includeAttrs = [...(includeAttributes || []), ...DEFAULT_INCLUDE_ATTRIBUTES];

  // Helper function to cap text length
  const capTextLength = (text: string, maxLength: number): string => {
    if (text.length > maxLength) {
      return text.substring(0, maxLength) + '...';
    }
    return text;
  };

  // Build tree structure from flat map
  const buildTreeNode = (nodeId: string): TreeNode | null => {
    const node = flatTree.map[nodeId];
    if (!node) return null;

    if (node.type === 'TEXT_NODE') {
      const textNode = node as TextDomNode;
      return {
        type: 'text',
        text: textNode.text,
        isVisible: textNode.isVisible,
        parent: null,
        children: [],
      };
    } else {
      const elementNode = node as ElementDomNode;
      const children: TreeNode[] = [];

      if (elementNode.children) {
        for (const childId of elementNode.children) {
          const child = buildTreeNode(childId);
          if (child) {
            child.parent = null; // Will be set later
            children.push(child);
          }
        }
      }

      return {
        type: 'element',
        tagName: elementNode.tagName,
        attributes: elementNode.attributes ?? {},
        isVisible: elementNode.isVisible ?? false,
        isInteractive: elementNode.isInteractive ?? false,
        isTopElement: elementNode.isTopElement ?? false,
        isNew: (elementNode as any).isNew ?? false,
        highlightIndex: elementNode.highlightIndex,
        parent: null,
        children,
        extra: elementNode.extra ?? {},
      };
    }
  };

  // Set parent references
  const setParentReferences = (node: TreeNode, parent: TreeNode | null = null) => {
    node.parent = parent;
    for (const child of node.children) {
      setParentReferences(child, node);
    }
  };

  // Build root node
  const rootNode = buildTreeNode(flatTree.rootId);
  if (!rootNode) return '';

  setParentReferences(rootNode);

  // Helper to check if text node has parent with highlight index
  const hasParentWithHighlightIndex = (node: TreeNode): boolean => {
    let current = node.parent;
    while (current) {
      if (current.type === 'element' && current.highlightIndex !== undefined) {
        return true;
      }
      current = current.parent;
    }
    return false;
  };

  // Main processing function
  const processNode = (node: TreeNode, depth: number, result: string[]): void => {
    let nextDepth = depth;
    const depthStr = '\t'.repeat(depth);

    if (node.type === 'element') {
      // Add element with highlight_index
      if (node.highlightIndex !== undefined) {
        nextDepth += 1;

        const text = getAllTextTillNextClickableElement(node);
        let attributesHtmlStr = '';

        if (includeAttrs.length > 0 && node.attributes) {
          const attributesToInclude = matchAttributes(node.attributes, includeAttrs);

          // Remove duplicate values (for attributes longer than 5 chars)
          const keys = Object.keys(attributesToInclude);
          if (keys.length > 1) {
            const keysToRemove = new Set<string>();
            const seenValues: Record<string, string> = {};

            for (const key of keys) {
              const value = attributesToInclude[key];
              if (value.length > 5) {
                if (value in seenValues) {
                  keysToRemove.add(key);
                } else {
                  seenValues[value] = key;
                }
              }
            }

            for (const key of keysToRemove) {
              delete attributesToInclude[key];
            }
          }

          // Remove role if it matches tagName
          if (attributesToInclude.role === node.tagName) {
            delete attributesToInclude.role;
          }

          // Remove attributes that duplicate text content
          const attrsToRemoveIfTextMatches = ['aria-label', 'placeholder', 'title'];
          for (const attr of attrsToRemoveIfTextMatches) {
            if (
              attributesToInclude[attr] &&
              attributesToInclude[attr].toLowerCase().trim() === text.toLowerCase().trim()
            ) {
              delete attributesToInclude[attr];
            }
          }

          if (Object.keys(attributesToInclude).length > 0) {
            attributesHtmlStr = Object.entries(attributesToInclude)
              .map(([key, value]) => `${key}=${capTextLength(value, 20)}`)
              .join(' ');
          }
        }

        // Build the line
        const highlightIndicator = node.isNew
          ? `*[${node.highlightIndex}]`
          : `[${node.highlightIndex}]`;
        let line = `${depthStr}${highlightIndicator}<${node.tagName ?? ''}`;

        if (attributesHtmlStr) {
          line += ` ${attributesHtmlStr}`;
        }

        // Scrollable data
        if (node.extra) {
          if (node.extra.scrollable) {
            let scrollDataText = '';
            if (node.extra.scrollData?.left)
              scrollDataText += `left=${node.extra.scrollData.left}, `;
            if (node.extra.scrollData?.top) scrollDataText += `top=${node.extra.scrollData.top}, `;
            if (node.extra.scrollData?.right)
              scrollDataText += `right=${node.extra.scrollData.right}, `;
            if (node.extra.scrollData?.bottom)
              scrollDataText += `bottom=${node.extra.scrollData.bottom}`;

            line += ` data-scrollable="${scrollDataText}"`;
          }
        }

        if (text) {
          const trimmedText = text.trim();
          if (!attributesHtmlStr) {
            line += ' ';
          }
          line += `>${trimmedText}`;
        } else if (!attributesHtmlStr) {
          line += ' ';
        }

        line += ' />';
        result.push(line);
      }

      // Process children regardless
      for (const child of node.children) {
        processNode(child, nextDepth, result);
      }
    } else if (node.type === 'text') {
      // Add text only if it doesn't have a highlighted parent
      if (hasParentWithHighlightIndex(node)) {
        return;
      }

      if (
        node.parent &&
        node.parent.type === 'element' &&
        node.parent.isVisible &&
        node.parent.isTopElement
      ) {
        result.push(`${depthStr}${node.text ?? ''}`);
      }
    }
  };

  const result: string[] = [];
  processNode(rootNode, 0, result);
  return result.join('\n');
}

// Get all text until next clickable element
export const getAllTextTillNextClickableElement = (node: TreeNode, maxDepth = -1): string => {
  const textParts: string[] = [];

  const collectText = (currentNode: TreeNode, currentDepth: number) => {
    if (maxDepth !== -1 && currentDepth > maxDepth) {
      return;
    }

    // Skip this branch if we hit a highlighted element (except for the current node)
    if (
      currentNode.type === 'element' &&
      currentNode !== node &&
      currentNode.highlightIndex !== undefined
    ) {
      return;
    }

    if (currentNode.type === 'text' && currentNode.text) {
      textParts.push(currentNode.text);
    } else if (currentNode.type === 'element') {
      for (const child of currentNode.children) {
        collectText(child, currentDepth + 1);
      }
    }
  };

  collectText(node, 0);
  return textParts.join('\n').trim();
};

export function getSelectorMap(flatTree: FlatDomTree): Map<number, InteractiveElementDomNode> {
  const selectorMap = new Map<number, InteractiveElementDomNode>();

  const keys = Object.keys(flatTree.map);
  for (const key of keys) {
    const node = flatTree.map[key];
    if (node.isInteractive && typeof node.highlightIndex === 'number') {
      selectorMap.set(node.highlightIndex, node as InteractiveElementDomNode);
    }
  }

  return selectorMap;
}

export function getElementTextMap(simplifiedHTML: string) {
  const lines = simplifiedHTML
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const elementTextMap = new Map<number, string>();
  for (const line of lines) {
    const regex = /^\[(\d+)\]<[^>]+>([^<]*)/;
    const match = regex.exec(line);
    if (match) {
      const index = parseInt(match[1], 10);
      elementTextMap.set(index, line);
    }
  }

  return elementTextMap;
}

export function cleanUpHighlights() {
  const cleanupFunctions = (window as any)._highlightCleanupFunctions || [];
  for (const cleanup of cleanupFunctions) {
    if (typeof cleanup === 'function') {
      cleanup();
    }
  }

  (window as any)._highlightCleanupFunctions = [];
}

// Listen for URL changes and immediately clean up highlights
window.addEventListener('popstate', () => {
  cleanUpHighlights();
});
window.addEventListener('hashchange', () => {
  cleanUpHighlights();
});
window.addEventListener('beforeunload', () => {
  cleanUpHighlights();
});

const navigation = (window as any).navigation;
if (navigation && typeof navigation.addEventListener === 'function') {
  navigation.addEventListener('navigate', () => {
    cleanUpHighlights();
  });
} else {
  // Fallback: poll for URL changes
  let currentUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      cleanUpHighlights();
    }
  }, 500);
}
