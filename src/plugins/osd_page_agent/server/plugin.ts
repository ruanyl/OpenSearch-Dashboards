/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { first } from 'rxjs/operators';
import {
  Plugin,
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Logger,
} from 'opensearch-dashboards/server';
import { ConfigType } from './config';
import { registerRoutes } from './routes';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OsdPageAgentServerSetup {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OsdPageAgentServerStart {}

export class OsdPageAgentServerPlugin
  implements Plugin<OsdPageAgentServerSetup, OsdPageAgentServerStart> {
  private readonly logger: Logger;

  constructor(private readonly ctx: PluginInitializerContext<ConfigType>) {
    this.logger = this.ctx.logger.get();
  }

  public async setup(core: CoreSetup): Promise<OsdPageAgentServerSetup> {
    const config = await this.ctx.config.create().pipe(first()).toPromise();

    if (!config.llm.bedrockApiKey) {
      this.logger.warn(
        'osd_page_agent: llm.bedrockApiKey is not configured. The plugin will be disabled.'
      );
      return {};
    }

    const router = core.http.createRouter();

    // GET /api/osd_page_agent/config — returns safe config (no secrets)
    router.get(
      {
        path: '/api/osd_page_agent/config',
        validate: false,
      },
      async (context, request, response) => {
        return response.ok({
          body: {
            enabled: config.enabled,
            modelId: config.llm.bedrockModelId,
            maxSteps: config.agent.maxSteps,
          },
        });
      }
    );

    registerRoutes(
      router,
      {
        bedrockRegion: config.llm.bedrockRegion,
        bedrockModelId: config.llm.bedrockModelId,
        bedrockApiKey: config.llm.bedrockApiKey,
      },
      this.logger
    );

    this.logger.info('osd_page_agent: plugin setup complete');

    return {};
  }

  public start(core: CoreStart): OsdPageAgentServerStart {
    return {};
  }

  public stop() {}
}
