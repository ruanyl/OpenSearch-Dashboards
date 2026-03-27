/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Adapted from page-agent/packages/page-controller/src/actions.ts
 * Full implementation of DOM action execution methods.
 */

import { InteractiveElementDomNode } from '../../common/types';
import {
  getNativeValueSetter,
  isHTMLElement,
  isInputElement,
  isSelectElement,
  isTextAreaElement,
  movePointerToElement,
  waitFor,
} from './utils';

/**
 * Get the HTMLElement by index from a selectorMap.
 * @private Internal method, subject to change at any time.
 */
export function getElementByIndex(
  selectorMap: Map<number, InteractiveElementDomNode>,
  index: number
): HTMLElement {
  const interactiveNode = selectorMap.get(index);
  if (!interactiveNode) {
    throw new Error(`No interactive element found at index ${index}`);
  }

  const element = interactiveNode.ref;
  if (!element) {
    throw new Error(`Element at index ${index} does not have a reference`);
  }

  if (!isHTMLElement(element)) {
    throw new Error(`Element at index ${index} is not an HTMLElement`);
  }

  return element;
}

let lastClickedElement: HTMLElement | null = null;

export function blurLastClickedElement() {
  if (lastClickedElement) {
    lastClickedElement.blur();
    lastClickedElement.dispatchEvent(
      new MouseEvent('mouseout', { bubbles: true, cancelable: true })
    );
    lastClickedElement.dispatchEvent(
      new MouseEvent('mouseleave', { bubbles: false, cancelable: true })
    );
    lastClickedElement = null;
  }
}

/**
 * Simulate a click on the element.
 * Full click sequence: blur previous, scrollIntoView, movePointer, hover events,
 * mousedown, focus, mouseup, click, 0.2s wait.
 * @private Internal method, subject to change at any time.
 */
export async function clickElement(element: HTMLElement) {
  blurLastClickedElement();

  lastClickedElement = element;

  await scrollIntoViewIfNeeded(element);
  // Scroll the iframe element itself into view if needed
  const frame = element.ownerDocument.defaultView?.frameElement;
  if (frame) await scrollIntoViewIfNeeded(frame);

  await movePointerToElement(element);
  window.dispatchEvent(new CustomEvent('PageAgent::ClickPointer'));

  await waitFor(0.1);

  // hover it
  element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));

  // dispatch a sequence of events to ensure all listeners are triggered
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

  // focus it to ensure it gets the click event
  element.focus();

  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  await waitFor(0.2); // Wait to ensure click event processing completes
}

/**
 * Input text into an element (input, textarea, or contenteditable).
 * For contenteditable: Plan A (synthetic events) + Plan B (execCommand fallback).
 * For input/textarea: uses getNativeValueSetter (critical for React).
 * @private Internal method, subject to change at any time.
 */
export async function inputTextElement(element: HTMLElement, text: string) {
  const isContentEditable = element.isContentEditable;
  if (!isInputElement(element) && !isTextAreaElement(element) && !isContentEditable) {
    throw new Error('Element is not an input, textarea, or contenteditable');
  }

  await clickElement(element);

  if (isContentEditable) {
    // Check if this is a Monaco editor — Monaco uses a textarea inside a
    // contenteditable container. We can detect it by looking for the Monaco class.
    const monacoEditor =
      element.closest('.monaco-editor') || element.querySelector('.monaco-editor');
    const monacoTextarea = monacoEditor
      ? (monacoEditor.querySelector('textarea.inputarea') as HTMLTextAreaElement)
      : null;

    if (monacoTextarea) {
      // Monaco editor: Monaco uses a hidden textarea as an input proxy.
      // We need to: 1) focus it, 2) select all existing content, 3) type new text.
      // Since Monaco intercepts textarea events, we simulate typing by:
      // - Setting the textarea value to our text
      // - Dispatching an 'input' event which Monaco listens to
      // - Monaco will insert whatever is in the textarea into the editor
      // But first we need to clear existing content via execCommand on the
      // contenteditable view lines container.
      monacoTextarea.focus();
      await waitFor(0.1);

      // Find the view lines container (the actual contenteditable area Monaco renders)
      const viewLines = monacoEditor!.querySelector('.view-lines') as HTMLElement;
      if (viewLines) {
        viewLines.focus();
        await waitFor(0.05);
      }

      // Select all and delete via execCommand on the document
      // This works because Monaco's editor area is focused
      document.execCommand('selectAll', false);
      await waitFor(0.05);
      document.execCommand('delete', false);
      await waitFor(0.05);

      // Now insert the new text
      document.execCommand('insertText', false, text);
      await waitFor(0.1);

      return;
    }

    // Non-Monaco contenteditable support (partial)

    // Dispatch beforeinput + mutation + input for clearing
    if (
      element.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'deleteContent',
        })
      )
    ) {
      element.innerText = '';
      element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'deleteContent',
        })
      );
    }

    // Dispatch beforeinput + mutation + input for insertion (important for React apps)
    if (
      element.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text,
        })
      )
    ) {
      element.innerText = text;
      element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: text,
        })
      );
    }

    // Verify Plan A worked by checking if the text was actually inserted
    const planASucceeded = element.innerText.trim() === text.trim();

    if (!planASucceeded) {
      // Plan B: execCommand fallback (deprecated but widely supported)
      // Works: Quill, Slate.js, react contenteditable components.
      // This approach integrates with the browser's undo stack and is handled
      // natively by most rich-text editors.
      element.focus();

      // Select all existing content and delete it
      const doc = element.ownerDocument;
      const selection = (doc.defaultView || window).getSelection();
      const range = doc.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);

      doc.execCommand('delete', false);
      doc.execCommand('insertText', false, text);
    }

    // Dispatch change event (for good measure)
    element.dispatchEvent(new Event('change', { bubbles: true }));

    // Trigger blur for validation
    element.blur();
  } else {
    getNativeValueSetter(element as HTMLInputElement | HTMLTextAreaElement).call(element, text);
  }

  // Only dispatch shared input event for non-contenteditable (contenteditable has its own)
  if (!isContentEditable) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  await waitFor(0.1);

  blurLastClickedElement();
}

/**
 * Select an option in a select element by matching option text.
 * @todo browser-use version is very complex and supports menu tags, need to follow up
 * @private Internal method, subject to change at any time.
 */
export async function selectOptionElement(selectElement: HTMLSelectElement, optionText: string) {
  if (!isSelectElement(selectElement)) {
    throw new Error('Element is not a select element');
  }

  const options = Array.from(selectElement.options);
  const option = options.find((opt) => opt.textContent?.trim() === optionText.trim());

  if (!option) {
    throw new Error(`Option with text "${optionText}" not found in select element`);
  }

  selectElement.value = option.value;
  selectElement.dispatchEvent(new Event('change', { bubbles: true }));

  await waitFor(0.1); // Wait to ensure change event processing completes
}

interface ScrollableElement extends Element {
  scrollIntoViewIfNeeded?: (centerIfNeeded?: boolean) => void;
}

/**
 * Scroll element into view using native scrollIntoViewIfNeeded or fallback.
 * @private Internal method, subject to change at any time.
 */
export async function scrollIntoViewIfNeeded(element: Element) {
  const el = element as ScrollableElement;
  if (typeof el.scrollIntoViewIfNeeded === 'function') {
    el.scrollIntoViewIfNeeded();
  } else {
    // @todo visibility check
    element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
  }
}

/**
 * Scroll vertically — element-specific or page-level scrolling with descriptive messages.
 * @private Internal method, subject to change at any time.
 */
export async function scrollVertically(
  down: boolean,
  scrollAmount: number,
  element?: HTMLElement | null
) {
  // Element-specific scrolling if element is provided
  if (element) {
    const targetElement = element;
    let currentElement = targetElement as HTMLElement | null;
    let scrollSuccess = false;
    let scrolledElement: HTMLElement | null = null;
    let scrollDelta = 0;
    let attempts = 0;
    const dy = scrollAmount;

    while (currentElement && attempts < 10) {
      const computedStyle = window.getComputedStyle(currentElement);
      const hasScrollableY = /(auto|scroll|overlay)/.test(computedStyle.overflowY);
      const canScrollVertically = currentElement.scrollHeight > currentElement.clientHeight;

      if (hasScrollableY && canScrollVertically) {
        const beforeScroll = currentElement.scrollTop;
        const maxScroll = currentElement.scrollHeight - currentElement.clientHeight;

        let adjustedAmount = dy / 3;

        if (adjustedAmount > 0) {
          adjustedAmount = Math.min(adjustedAmount, maxScroll - beforeScroll);
        } else {
          adjustedAmount = Math.max(adjustedAmount, -beforeScroll);
        }

        currentElement.scrollTop = beforeScroll + adjustedAmount;

        const afterScroll = currentElement.scrollTop;
        const actualScrollDelta = afterScroll - beforeScroll;

        if (Math.abs(actualScrollDelta) > 0.5) {
          scrollSuccess = true;
          scrolledElement = currentElement;
          scrollDelta = actualScrollDelta;
          break;
        }
      }

      if (currentElement === document.body || currentElement === document.documentElement) {
        break;
      }
      currentElement = currentElement.parentElement;
      attempts++;
    }

    if (scrollSuccess) {
      return `Scrolled container (${scrolledElement?.tagName}) by ${scrollDelta}px`;
    } else {
      return `No scrollable container found for element (${targetElement.tagName})`;
    }
  }

  // Page-level scrolling (default or fallback)

  const dy = scrollAmount;
  const bigEnough = (el: HTMLElement) => el.clientHeight >= window.innerHeight * 0.5;
  const canScroll = (el: HTMLElement | null) =>
    el &&
    /(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY) &&
    el.scrollHeight > el.clientHeight &&
    bigEnough(el);

  let el: HTMLElement | null = document.activeElement as HTMLElement | null;
  while (el && !canScroll(el) && el !== document.body) el = el.parentElement;

  el = canScroll(el)
    ? el
    : Array.from(document.querySelectorAll<HTMLElement>('*')).find(canScroll) ||
      (document.scrollingElement as HTMLElement) ||
      (document.documentElement as HTMLElement);

  if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
    // Page-level scroll
    const scrollBefore = window.scrollY;
    const scrollMax = document.documentElement.scrollHeight - window.innerHeight;

    window.scrollBy(0, dy);

    const scrollAfter = window.scrollY;
    const scrolled = scrollAfter - scrollBefore;

    if (Math.abs(scrolled) < 1) {
      return dy > 0
        ? `⚠️ Already at the bottom of the page, cannot scroll down further.`
        : `⚠️ Already at the top of the page, cannot scroll up further.`;
    }

    const reachedBottom = dy > 0 && scrollAfter >= scrollMax - 1;
    const reachedTop = dy < 0 && scrollAfter <= 1;

    if (reachedBottom) return `✅ Scrolled page by ${scrolled}px. Reached the bottom of the page.`;
    if (reachedTop) return `✅ Scrolled page by ${scrolled}px. Reached the top of the page.`;
    return `✅ Scrolled page by ${scrolled}px.`;
  } else {
    // Container scroll
    const scrollBefore = el!.scrollTop;
    const scrollMax = el!.scrollHeight - el!.clientHeight;

    el!.scrollBy({ top: dy, behavior: 'smooth' });
    await waitFor(0.1);

    const scrollAfter = el!.scrollTop;
    const scrolled = scrollAfter - scrollBefore;

    if (Math.abs(scrolled) < 1) {
      return dy > 0
        ? `⚠️ Already at the bottom of container (${el!.tagName}), cannot scroll down further.`
        : `⚠️ Already at the top of container (${el!.tagName}), cannot scroll up further.`;
    }

    const reachedBottom = dy > 0 && scrollAfter >= scrollMax - 1;
    const reachedTop = dy < 0 && scrollAfter <= 1;

    if (reachedBottom)
      return `✅ Scrolled container (${el!.tagName}) by ${scrolled}px. Reached the bottom.`;
    if (reachedTop)
      return `✅ Scrolled container (${el!.tagName}) by ${scrolled}px. Reached the top.`;
    return `✅ Scrolled container (${el!.tagName}) by ${scrolled}px.`;
  }
}

/**
 * Scroll horizontally — element-specific or page-level scrolling with descriptive messages.
 * Same pattern as scrollVertically but for horizontal axis.
 * @private Internal method, subject to change at any time.
 */
export async function scrollHorizontally(
  right: boolean,
  scrollAmount: number,
  element?: HTMLElement | null
) {
  // Element-specific scrolling if element is provided
  if (element) {
    const targetElement = element;
    let currentElement = targetElement as HTMLElement | null;
    let scrollSuccess = false;
    let scrolledElement: HTMLElement | null = null;
    let scrollDelta = 0;
    let attempts = 0;
    const dx = right ? scrollAmount : -scrollAmount;

    while (currentElement && attempts < 10) {
      const computedStyle = window.getComputedStyle(currentElement);
      const hasScrollableX = /(auto|scroll|overlay)/.test(computedStyle.overflowX);
      const canScrollHorizontally = currentElement.scrollWidth > currentElement.clientWidth;

      if (hasScrollableX && canScrollHorizontally) {
        const beforeScroll = currentElement.scrollLeft;
        const maxScroll = currentElement.scrollWidth - currentElement.clientWidth;

        let adjustedAmount = dx / 3;

        if (adjustedAmount > 0) {
          adjustedAmount = Math.min(adjustedAmount, maxScroll - beforeScroll);
        } else {
          adjustedAmount = Math.max(adjustedAmount, -beforeScroll);
        }

        currentElement.scrollLeft = beforeScroll + adjustedAmount;

        const afterScroll = currentElement.scrollLeft;
        const actualScrollDelta = afterScroll - beforeScroll;

        if (Math.abs(actualScrollDelta) > 0.5) {
          scrollSuccess = true;
          scrolledElement = currentElement;
          scrollDelta = actualScrollDelta;
          break;
        }
      }

      if (currentElement === document.body || currentElement === document.documentElement) {
        break;
      }
      currentElement = currentElement.parentElement;
      attempts++;
    }

    if (scrollSuccess) {
      return `Scrolled container (${scrolledElement?.tagName}) horizontally by ${scrollDelta}px`;
    } else {
      return `No horizontally scrollable container found for element (${targetElement.tagName})`;
    }
  }

  // Page-level scrolling (default or fallback)

  const dx = right ? scrollAmount : -scrollAmount;
  const bigEnough = (el: HTMLElement) => el.clientWidth >= window.innerWidth * 0.5;
  const canScroll = (el: HTMLElement | null) =>
    el &&
    /(auto|scroll|overlay)/.test(getComputedStyle(el).overflowX) &&
    el.scrollWidth > el.clientWidth &&
    bigEnough(el);

  let el: HTMLElement | null = document.activeElement as HTMLElement | null;
  while (el && !canScroll(el) && el !== document.body) el = el.parentElement;

  el = canScroll(el)
    ? el
    : Array.from(document.querySelectorAll<HTMLElement>('*')).find(canScroll) ||
      (document.scrollingElement as HTMLElement) ||
      (document.documentElement as HTMLElement);

  if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
    // Page-level scroll
    const scrollBefore = window.scrollX;
    const scrollMax = document.documentElement.scrollWidth - window.innerWidth;

    window.scrollBy(dx, 0);

    const scrollAfter = window.scrollX;
    const scrolled = scrollAfter - scrollBefore;

    if (Math.abs(scrolled) < 1) {
      return dx > 0
        ? `⚠️ Already at the right edge of the page, cannot scroll right further.`
        : `⚠️ Already at the left edge of the page, cannot scroll left further.`;
    }

    const reachedRight = dx > 0 && scrollAfter >= scrollMax - 1;
    const reachedLeft = dx < 0 && scrollAfter <= 1;

    if (reachedRight)
      return `✅ Scrolled page by ${scrolled}px. Reached the right edge of the page.`;
    if (reachedLeft) return `✅ Scrolled page by ${scrolled}px. Reached the left edge of the page.`;
    return `✅ Scrolled page horizontally by ${scrolled}px.`;
  } else {
    // Container scroll
    const scrollBefore = el!.scrollLeft;
    const scrollMax = el!.scrollWidth - el!.clientWidth;

    el!.scrollBy({ left: dx, behavior: 'smooth' });
    await waitFor(0.1);

    const scrollAfter = el!.scrollLeft;
    const scrolled = scrollAfter - scrollBefore;

    if (Math.abs(scrolled) < 1) {
      return dx > 0
        ? `⚠️ Already at the right edge of container (${el!.tagName}), cannot scroll right further.`
        : `⚠️ Already at the left edge of container (${el!.tagName}), cannot scroll left further.`;
    }

    const reachedRight = dx > 0 && scrollAfter >= scrollMax - 1;
    const reachedLeft = dx < 0 && scrollAfter <= 1;

    if (reachedRight)
      return `✅ Scrolled container (${el!.tagName}) by ${scrolled}px. Reached the right edge.`;
    if (reachedLeft)
      return `✅ Scrolled container (${el!.tagName}) by ${scrolled}px. Reached the left edge.`;
    return `✅ Scrolled container (${el!.tagName}) horizontally by ${scrolled}px.`;
  }
}
