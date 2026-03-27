/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IRouter, Logger } from 'opensearch-dashboards/server';
import { registerLlmProxyRoute } from './llm_proxy';

interface RouteConfig {
  bedrockRegion: string;
  bedrockModelId: string;
  bedrockApiKey: string;
}

export function registerRoutes(router: IRouter, config: RouteConfig, logger: Logger) {
  registerLlmProxyRoute(router, config, logger);
}
