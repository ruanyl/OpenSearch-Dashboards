/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PluginInitializerContext } from 'opensearch-dashboards/public';
import { OsdPageAgentPlugin } from './plugin';

export { OsdPageAgentPlugin as Plugin };
export { OsdPageAgentSetupDeps, OsdPageAgentStartDeps } from './plugin';

export function plugin(initializerContext: PluginInitializerContext) {
  return new OsdPageAgentPlugin(initializerContext);
}
