/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { schema } from '@osd/config-schema';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { PluginInitializerContext, CoreSetup, CoreStart, Plugin } from '../../../core/server';
import { registerVegaUsageCollector } from './usage_collector';
import {
  ConfigObservable,
  VisTypeVegaPluginSetupDependencies,
  VisTypeVegaPluginSetup,
  VisTypeVegaPluginStart,
} from './types';
import {
  VEGA_VISUALIZATION_CLIENT_WRAPPER_ID,
  vegaVisualizationClientWrapper,
} from './vega_visualization_client_wrapper';
import { setDataSourceEnabled } from './services';

export const invokeText2Vega = async (
  prompt: string,
  modelId = 'anthropic.claude-3-sonnet-20240229-v1:0'
  // modelId = 'anthropic.claude-3-haiku-20240307-v1:0'
) => {
  // Create a new Bedrock Runtime client instance.
  const client = new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.SECRET_ACCESS_KEY ?? '',
    },
  });

  // Prepare the payload for the model.
  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 4000,
    temperature: 0.0,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    ],
  };

  // Invoke Claude with the payload and wait for the response.
  const command = new InvokeModelCommand({
    contentType: 'application/json',
    body: JSON.stringify(payload),
    modelId,
  });
  const apiResponse = await client.send(command);

  const decodedResponseBody = new TextDecoder().decode(apiResponse.body);
  const responseBody = JSON.parse(decodedResponseBody);
  return responseBody.content[0].text as string;
};

export class VisTypeVegaPlugin implements Plugin<VisTypeVegaPluginSetup, VisTypeVegaPluginStart> {
  private readonly config: ConfigObservable;

  constructor(initializerContext: PluginInitializerContext) {
    this.config = initializerContext.config.legacy.globalConfig$;
  }

  public setup(
    core: CoreSetup,
    { home, usageCollection, dataSource }: VisTypeVegaPluginSetupDependencies
  ) {
    if (usageCollection) {
      registerVegaUsageCollector(usageCollection, this.config, { home });
    }
    setDataSourceEnabled({ enabled: dataSource?.dataSourceEnabled() || false });
    core.savedObjects.addClientWrapper(
      10,
      VEGA_VISUALIZATION_CLIENT_WRAPPER_ID,
      vegaVisualizationClientWrapper
    );

    // register router
    const router = core.http.createRouter();
    router.post(
      {
        path: '/api/llm/text2vega',
        validate: {
          body: schema.object({
            query: schema.string(),
          }),
        },
      },
      router.handleLegacyErrors(async (context, req, res) => {
        const result = await invokeText2Vega(req.body.query);
        return res.ok({ body: result });
      })
    );

    router.post(
      {
        path: '/api/llm/text2ppl',
        validate: {
          body: schema.object({
            index: schema.string(),
            question: schema.string(),
          }),
        },
      },
      router.handleLegacyErrors(async (context, req, res) => {
        const result = await context.core.opensearch.client.asCurrentUser.transport.request({
          method: 'POST',
          path: '/_plugins/_ml/agents/uJmpgI8BGmD7E2dhTm4e/_execute',
          body: {
            parameters: {
              question: req.body.question,
              index: req.body.index,
            },
          },
        });
        return res.ok({ body: result });
      })
    );

    return {};
  }

  public start(core: CoreStart) {
    return {};
  }
  public stop() {}
}
