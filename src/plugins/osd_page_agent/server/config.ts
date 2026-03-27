/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema, TypeOf } from '@osd/config-schema';

export const configSchema = schema.object({
  enabled: schema.boolean({ defaultValue: true }),
  llm: schema.object({
    bedrockRegion: schema.string({ defaultValue: '' }),
    bedrockModelId: schema.string({
      defaultValue: '',
    }),
    bedrockApiKey: schema.string({
      defaultValue: '',
    }),
    temperature: schema.number({ defaultValue: 0, min: 0, max: 1 }),
    maxTokens: schema.number({ defaultValue: 4096, min: 1 }),
  }),
  agent: schema.object({
    maxSteps: schema.number({ defaultValue: 40, min: 1, max: 200 }),
  }),
});

export type ConfigType = TypeOf<typeof configSchema>;
