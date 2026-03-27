/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { IRouter, Logger } from 'opensearch-dashboards/server';
// @ts-ignore
import fetch from 'node-fetch';

interface LlmProxyConfig {
  bedrockRegion: string;
  bedrockModelId: string;
  bedrockApiKey: string;
}

export function registerLlmProxyRoute(router: IRouter, config: LlmProxyConfig, logger: Logger) {
  router.post(
    {
      path: '/api/osd_page_agent/llm/chat_completions',
      validate: {
        body: schema.object({
          messages: schema.arrayOf(
            schema.object({
              role: schema.string(),
              content: schema.any(),
            })
          ),
          max_tokens: schema.number(),
          tools: schema.maybe(schema.arrayOf(schema.any())),
          tool_choice: schema.maybe(schema.any()),
          temperature: schema.maybe(schema.number()),
          system: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      const {
        messages,
        max_tokens: maxTokens,
        tools,
        tool_choice: toolChoice,
        temperature,
        system,
      } = request.body;

      const bedrockUrl = `https://bedrock-runtime.${config.bedrockRegion}.amazonaws.com/model/${config.bedrockModelId}/invoke`;

      const bedrockBody: Record<string, any> = {
        anthropic_version: 'bedrock-2023-05-31',
        messages,
        max_tokens: maxTokens,
      };

      if (tools !== undefined) {
        bedrockBody.tools = tools;
      }
      if (toolChoice !== undefined) {
        bedrockBody.tool_choice = toolChoice;
      }
      if (temperature !== undefined) {
        bedrockBody.temperature = temperature;
      }
      if (system !== undefined) {
        bedrockBody.system = system;
      }

      try {
        const bedrockResponse = await fetch(bedrockUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.bedrockApiKey}`,
          },
          body: JSON.stringify(bedrockBody),
        });

        const responseBody = await bedrockResponse.json();

        if (!bedrockResponse.ok) {
          const statusCode = bedrockResponse.status;

          if (statusCode >= 500) {
            return response.custom({
              statusCode: 502,
              body: {
                statusCode: 502,
                error: 'Bad Gateway',
                message: `Upstream Bedrock error: ${
                  responseBody.message || bedrockResponse.statusText
                }`,
              },
            });
          }

          return response.custom({
            statusCode,
            body: {
              statusCode,
              error: bedrockResponse.statusText,
              message: responseBody.message || 'Bedrock request failed',
            },
          });
        }

        return response.ok({ body: responseBody });
      } catch (err) {
        logger.error(`LLM proxy request failed: ${err.message}`);
        return response.custom({
          statusCode: 502,
          body: {
            statusCode: 502,
            error: 'Bad Gateway',
            message: `Failed to reach Bedrock endpoint: ${err.message}`,
          },
        });
      }
    }
  );
}
