/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsType } from 'opensearch-dashboards/server';
import { WORKSPACE_TEMP_JUMP_QUERYSTRING } from '../constants';

export const workspace: SavedObjectsType = {
  name: 'workspace',
  namespaceType: 'agnostic',
  hidden: false,
  management: {
    icon: 'apps', // todo: pending ux #2034
    defaultSearchField: 'title',
    importableAndExportable: true,
    getTitle(obj) {
      return obj.attributes.name;
    },
    getInAppUrl(obj) {
      return {
        /**
         * As path is always relative to basePath,
         * we have to add the workspace id into query.
         * There is a handler in src/core/server/workspaces/workspaces_service.ts to
         * handle the redirect logic.
         */
        path: `/app/workspace/overview?${WORKSPACE_TEMP_JUMP_QUERYSTRING}=${obj.id}`,
        uiCapabilitiesPath: 'management.opensearchDashboards.dataSources',
        browserJump: true,
      };
    },
  },
  mappings: {
    dynamic: false,
    properties: {
      name: {
        type: 'keyword',
      },
      description: {
        type: 'text',
      },
      /**
       * In opensearch, string[] is also mapped to text
       */
      features: {
        type: 'text',
      },
      color: {
        type: 'text',
      },
      icon: {
        type: 'text',
      },
      defaultVISTheme: {
        type: 'text',
      },
    },
  },
};
