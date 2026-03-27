/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable max-classes-per-file */

/**
 * LLM client for the OSD page agent.
 *
 * Adapted from page-agent's LLM class (packages/llms/src/index.ts) and
 * error types (packages/llms/src/errors.ts).
 *
 * Key differences from page-agent:
 * - Uses OSD's HttpSetup.post() to call the server-side Bedrock proxy
 *   instead of direct OpenAI API calls
 * - Parses Anthropic Messages API responses (tool_use content blocks)
 *   instead of OpenAI tool_calls format
 * - Keeps the same retry logic (withRetry) and InvokeError types
 * - Extends EventTarget for retry/error events (same pattern as page-agent)
 */

import { HttpSetup } from '../../../../core/public';
import { LlmChatRequest, LlmChatResponse, AnthropicToolDefinition } from '../../common/types';

// ---------------------------------------------------------------------------
// Error types adapted from page-agent/packages/llms/src/errors.ts
// ---------------------------------------------------------------------------

export const InvokeErrorType = {
  NETWORK_ERROR: 'network_error',
  RATE_LIMIT: 'rate_limit',
  SERVER_ERROR: 'server_error',
  NO_TOOL_CALL: 'no_tool_call',
  INVALID_TOOL_ARGS: 'invalid_tool_args',
  TOOL_EXECUTION_ERROR: 'tool_execution_error',
  UNKNOWN: 'unknown',
  AUTH_ERROR: 'auth_error',
  CONTEXT_LENGTH: 'context_length',
  CONTENT_FILTER: 'content_filter',
} as const;

export type InvokeErrorType = typeof InvokeErrorType[keyof typeof InvokeErrorType];

export class InvokeError extends Error {
  type: InvokeErrorType;
  retryable: boolean;
  rawError?: unknown;
  rawResponse?: unknown;

  constructor(type: InvokeErrorType, message: string, rawError?: unknown, rawResponse?: unknown) {
    super(message);
    this.name = 'InvokeError';
    this.type = type;
    this.rawError = rawError;
    this.rawResponse = rawResponse;

    const retryableTypes: InvokeErrorType[] = [
      InvokeErrorType.NETWORK_ERROR,
      InvokeErrorType.RATE_LIMIT,
      InvokeErrorType.SERVER_ERROR,
      InvokeErrorType.NO_TOOL_CALL,
      InvokeErrorType.INVALID_TOOL_ARGS,
      InvokeErrorType.TOOL_EXECUTION_ERROR,
      InvokeErrorType.UNKNOWN,
    ];
    this.retryable = retryableTypes.includes(type);
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LLM_MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface InvokeResult {
  toolCall: { name: string; input: Record<string, any> };
  usage: { inputTokens: number; outputTokens: number };
  rawResponse: unknown;
}

// ---------------------------------------------------------------------------
// LLM Client
// ---------------------------------------------------------------------------

/**
 * LLM client that calls the OSD server-side Bedrock proxy.
 * Adapted from page-agent's LLM class with retry logic.
 */
export class BedrockLlmClient extends EventTarget {
  private maxRetries: number;

  constructor(private readonly http: HttpSetup, maxRetries?: number) {
    super();
    this.maxRetries = maxRetries ?? LLM_MAX_RETRIES;
  }

  async invoke(
    messages: LlmChatRequest['messages'],
    tools: AnthropicToolDefinition[],
    toolChoiceName: string,
    abortSignal: AbortSignal,
    options?: { maxTokens?: number; temperature?: number; system?: string }
  ): Promise<InvokeResult> {
    return this.withRetry(async () => {
      if (abortSignal.aborted) throw new InvokeError(InvokeErrorType.NETWORK_ERROR, 'Aborted');

      const body: LlmChatRequest = {
        messages,
        max_tokens: options?.maxTokens ?? 4096,
        tools,
        tool_choice: { type: 'tool', name: toolChoiceName },
        temperature: options?.temperature ?? 0,
        system: options?.system,
      };

      let response: LlmChatResponse;
      try {
        response = await this.http.post('/api/osd_page_agent/llm/chat_completions', {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        // Check for HTTP error responses from the proxy
        const statusCode = err?.response?.status || err?.body?.statusCode;
        if (statusCode === 401 || statusCode === 403) {
          throw new InvokeError(
            InvokeErrorType.AUTH_ERROR,
            `Authentication failed: ${err.message}`,
            err
          );
        }
        if (statusCode === 429) {
          throw new InvokeError(InvokeErrorType.RATE_LIMIT, `Rate limit: ${err.message}`, err);
        }
        if (statusCode >= 500) {
          throw new InvokeError(InvokeErrorType.SERVER_ERROR, `Server error: ${err.message}`, err);
        }
        throw new InvokeError(InvokeErrorType.NETWORK_ERROR, `Network error: ${err.message}`, err);
      }

      // Find the tool_use content block in the Anthropic response
      const toolUseBlock = response.content?.find((block) => block.type === 'tool_use');
      if (!toolUseBlock || !toolUseBlock.name || !toolUseBlock.input) {
        throw new InvokeError(
          InvokeErrorType.NO_TOOL_CALL,
          'No tool_use block found in Anthropic response',
          undefined,
          response
        );
      }

      return {
        toolCall: {
          name: toolUseBlock.name,
          input: toolUseBlock.input,
        },
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
        rawResponse: response,
      };
    });
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      if (attempt > 0) {
        this.dispatchEvent(
          new CustomEvent('retry', { detail: { attempt, maxAttempts: this.maxRetries } })
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      try {
        return await fn();
      } catch (error: unknown) {
        // Do not retry AbortErrors
        if ((error as any)?.rawError?.name === 'AbortError') throw error;
        if (error instanceof InvokeError && !error.retryable) throw error;

        this.dispatchEvent(new CustomEvent('error', { detail: { error } }));
        lastError = error as Error;
        attempt++;
      }
    }

    throw lastError || new InvokeError(InvokeErrorType.UNKNOWN, 'Max retries exceeded');
  }
}
