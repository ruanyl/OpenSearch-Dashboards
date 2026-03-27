/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Adapted from:
 * - page-agent/packages/page-controller/src/utils/index.ts
 * - page-agent/packages/core/src/utils/index.ts
 */

// ======= type guards =======
// @note instanceof fails for elements inside iframes

export function isHTMLElement(el: unknown): el is HTMLElement {
  // @todo either specify to HTMLElement or allow Element here.
  return !!el && (el as Node).nodeType === 1;
}

export function isInputElement(el: Element): el is HTMLInputElement {
  return el?.nodeType === 1 && el.tagName === 'INPUT';
}

export function isTextAreaElement(el: Element): el is HTMLTextAreaElement {
  return el?.nodeType === 1 && el.tagName === 'TEXTAREA';
}

export function isSelectElement(el: Element): el is HTMLSelectElement {
  return el?.nodeType === 1 && el.tagName === 'SELECT';
}

export function isAnchorElement(el: Element): el is HTMLAnchorElement {
  return el?.nodeType === 1 && el.tagName === 'A';
}

// ======= iframe helpers =======

/** Iframe offset for translating element coordinates to top-frame viewport. */
export function getIframeOffset(element: HTMLElement): { x: number; y: number } {
  const frame = element.ownerDocument.defaultView?.frameElement as HTMLElement | null;
  if (!frame) return { x: 0, y: 0 };
  const rect = frame.getBoundingClientRect();
  return { x: rect.left, y: rect.top };
}

/**
 * Get native value setter from the element's own prototype (iframe-safe).
 * @note for React — bypasses React's synthetic event system by getting the
 * native DOM setter directly from the prototype chain.
 */
export function getNativeValueSetter(element: HTMLInputElement | HTMLTextAreaElement) {
  return Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element) as object, 'value')!
    .set as (v: string) => void;
}

// ======= general utils =======

export async function waitFor(seconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// ======= dom utils =======

export async function movePointerToElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const offset = getIframeOffset(element);
  const x = rect.left + rect.width / 2 + offset.x;
  const y = rect.top + rect.height / 2 + offset.y;

  window.dispatchEvent(new CustomEvent('PageAgent::MovePointerTo', { detail: { x, y } }));

  await waitFor(0.3);
}

// ======= core utils (from page-agent/packages/core/src/utils/index.ts) =======

/**
 * Simple assertion function that throws an error if the condition is falsy.
 * @param condition - The condition to assert
 * @param message - Optional error message
 * @throws Error if condition is falsy
 */
export function assert(condition: unknown, message?: string, silent?: boolean): asserts condition {
  if (!condition) {
    const errorMessage = message ?? 'Assertion failed';

    if (!silent) {
      // eslint-disable-next-line no-console
      console.error(`❌ assert: ${errorMessage}`);
    }

    throw new Error(errorMessage);
  }
}

/**
 * Generate a random string ID.
 * @param existingIDs - Optional array of existing IDs to avoid collisions
 */
export function randomID(existingIDs?: string[]): string {
  let id = Math.random().toString(36).substring(2, 11);

  if (!existingIDs) {
    return id;
  }

  const MAX_TRY = 1000;
  let tryCount = 0;

  while (existingIDs.includes(id)) {
    id = Math.random().toString(36).substring(2, 11);
    tryCount++;
    if (tryCount > MAX_TRY) {
      throw new Error('randomID: too many tries');
    }
  }

  return id;
}

const _global = globalThis as any;

if (!_global.__PAGE_AGENT_IDS__) {
  _global.__PAGE_AGENT_IDS__ = [];
}

const ids = _global.__PAGE_AGENT_IDS__;

/**
 * Generate a random ID.
 * @note Unique within this window.
 */
export function uid() {
  const id = randomID(ids);
  ids.push(id);
  return id;
}

/**
 * Truncate text to a maximum length, appending "..." if truncated.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '...';
  }
  return text;
}
