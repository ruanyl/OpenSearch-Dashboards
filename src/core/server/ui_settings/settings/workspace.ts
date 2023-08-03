/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { i18n } from '@osd/i18n';
import { UiSettingsParams } from '../../../types';
import { WORKSPACE_FEATURE_FLAG_KEY_IN_UI_SETTINGS } from '../../../utils';

export const getWorkspaceSettings = (): Record<string, UiSettingsParams> => {
  return {
    [WORKSPACE_FEATURE_FLAG_KEY_IN_UI_SETTINGS]: {
      name: i18n.translate('core.ui_settings.params.workspace.enableWorkspaceTitle', {
        defaultMessage: 'Enable Workspace',
      }),
      value: false,
      requiresPageReload: true,
      description: i18n.translate('core.ui_settings.params.workspace.enableWorkspaceTitle', {
        defaultMessage: 'Enable or disable OpenSearch Dashboards Workspace',
      }),
      category: ['workspace'],
      schema: schema.boolean(),
    },
  };
};
