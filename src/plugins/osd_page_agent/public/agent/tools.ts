/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Internal tools for the OSD page agent.
 *
 * Adapted from page-agent/packages/core/src/tools/index.ts
 *
 * Modifications:
 * - Removed Zod imports — converted each tool's inputSchema from Zod to JSON Schema objects
 * - Removed @page-agent/* imports
 * - Import PageAgentTool from '../../common/types'
 * - Changed inputSchema type to Record<string, any> (JSON Schema)
 * - Removed execute_javascript tool (not needed for OSD)
 * - Keep execute functions — they are bound to PageAgentCore at call time via .bind(this)
 */

import type { PageAgentTool } from '../../common/types';
import { waitFor } from './utils';

/**
 * Helper to create a typed tool definition.
 */
export function tool<TParams = any>(options: PageAgentTool<TParams>): PageAgentTool<TParams> {
  return options;
}

/**
 * Internal tools for the OSD page agent.
 * Note: Using any to allow different parameter types for each tool.
 */
export const tools = new Map<string, PageAgentTool>();

tools.set(
  'done',
  tool({
    description:
      'Complete task. Text is your final response to the user — keep it concise unless the user explicitly asks for detail.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        success: { type: 'boolean' },
      },
      required: ['text'],
    },
    // eslint-disable-next-line object-shorthand
    execute: async function (this: any, _input: any) {
      // Main loop handles the 'done' action
      return Promise.resolve('Task completed');
    },
  })
);

tools.set(
  'wait',
  tool({
    description: 'Wait for x seconds. Can be used to wait until the page or data is fully loaded.',
    inputSchema: {
      type: 'object',
      properties: {
        seconds: { type: 'number', minimum: 1, maximum: 10 },
      },
      required: ['seconds'],
    },
    // eslint-disable-next-line object-shorthand
    execute: async function (this: any, input: any) {
      // Try to subtract LLM calling time from the actual wait time
      const lastTimeUpdate = await this.pageController.getLastUpdateTime();
      const actualWaitTime = Math.max(0, input.seconds - (Date.now() - lastTimeUpdate) / 1000);
      // eslint-disable-next-line no-console
      console.log(`actualWaitTime: ${actualWaitTime} seconds`);
      await waitFor(actualWaitTime);

      return `✅ Waited for ${input.seconds} seconds.`;
    },
  })
);

tools.set(
  'ask_user',
  tool({
    description:
      'Ask the user a question and wait for their answer. Use this if you need more information or clarification.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
      },
      required: ['question'],
    },
    // eslint-disable-next-line object-shorthand
    execute: async function (this: any, input: any) {
      if (!this.onAskUser) {
        throw new Error('ask_user tool requires onAskUser callback to be set');
      }
      const answer = await this.onAskUser(input.question);
      return `User answered: ${answer}`;
    },
  })
);

tools.set(
  'click_element_by_index',
  tool({
    description: 'Click element by index',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', minimum: 0 },
      },
      required: ['index'],
    },
    // eslint-disable-next-line object-shorthand
    execute: async function (this: any, input: any) {
      const result = await this.pageController.clickElement(input.index);
      return result.message;
    },
  })
);

tools.set(
  'input_text',
  tool({
    description: 'Click and type text into an interactive input element',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', minimum: 0 },
        text: { type: 'string' },
      },
      required: ['index', 'text'],
    },
    // eslint-disable-next-line object-shorthand
    execute: async function (this: any, input: any) {
      const result = await this.pageController.inputText(input.index, input.text);
      return result.message;
    },
  })
);

tools.set(
  'select_dropdown_option',
  tool({
    description:
      'Select dropdown option for interactive element index by the text of the option you want to select',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', minimum: 0 },
        text: { type: 'string' },
      },
      required: ['index', 'text'],
    },
    // eslint-disable-next-line object-shorthand
    execute: async function (this: any, input: any) {
      const result = await this.pageController.selectOption(input.index, input.text);
      return result.message;
    },
  })
);

tools.set(
  'scroll',
  tool({
    description: 'Scroll the page vertically. Use index for scroll elements (dropdowns/custom UI).',
    inputSchema: {
      type: 'object',
      properties: {
        down: { type: 'boolean' },
        num_pages: { type: 'number', minimum: 0, maximum: 10 },
        pixels: { type: 'integer', minimum: 0 },
        index: { type: 'integer', minimum: 0 },
      },
      required: ['down'],
    },
    // eslint-disable-next-line object-shorthand
    execute: async function (this: any, input: any) {
      const result = await this.pageController.scroll({
        ...input,
        numPages: input.num_pages,
      });
      return result.message;
    },
  })
);

tools.set(
  'scroll_horizontally',
  tool({
    description:
      'Scroll the page horizontally, or within a specific element by index. Useful for wide tables.',
    inputSchema: {
      type: 'object',
      properties: {
        right: { type: 'boolean' },
        pixels: { type: 'integer', minimum: 0 },
        index: { type: 'integer', minimum: 0 },
      },
      required: ['right', 'pixels'],
    },
    // eslint-disable-next-line object-shorthand
    execute: async function (this: any, input: any) {
      const result = await this.pageController.scrollHorizontally(input);
      return result.message;
    },
  })
);
