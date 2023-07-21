/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsType } from 'opensearch-dashboards/server';

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
