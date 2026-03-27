/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PluginConfigDescriptor, PluginInitializerContext } from 'opensearch-dashboards/server';
import { ConfigType, configSchema } from './config';
import { OsdPageAgentServerPlugin } from './plugin';

export function plugin(ctx: PluginInitializerContext) {
  return new OsdPageAgentServerPlugin(ctx);
}

export const config: PluginConfigDescriptor<ConfigType> = {
  schema: configSchema,
  exposeToBrowser: {
    enabled: true,
  },
};
