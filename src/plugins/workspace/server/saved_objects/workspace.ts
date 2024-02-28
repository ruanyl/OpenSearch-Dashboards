/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SavedObjectsFieldMapping,
  SavedObjectsType,
  WORKSPACE_TYPE,
} from '../../../../core/server';

export const workspace: SavedObjectsType = {
  name: WORKSPACE_TYPE,
  namespaceType: 'agnostic',
  /**
   * Disable operation by using saved objects APIs on workspace metadata
   */
  hidden: true,
  /**
   * workspace won't appear in management page.
   */
  mappings: {
    dynamic: false,
    properties: {
      name: {
        type: 'keyword',
      },
      description: {
        type: 'text',
      },
      features: {
        type: 'keyword',
      },
      color: {
        type: 'keyword',
      },
      icon: {
        type: 'keyword',
      },
      defaultVISTheme: {
        type: 'keyword',
      },
      reserved: {
        type: 'boolean',
      },
    },
  },
};

const principals: SavedObjectsFieldMapping = {
  properties: {
    users: {
      type: 'keyword',
    },
    groups: {
      type: 'keyword',
    },
  },
};
export const permission: SavedObjectsType = {
  name: 'permission',
  namespaceType: 'agnostic',
  /**
   * Disable operation by using saved objects APIs on workspace metadata
   */
  hidden: true,
  /**
   * workspace won't appear in management page.
   */
  mappings: {
    dynamic: false,
    properties: {
      read: principals,
      write: principals,
      management: principals,
      library_read: principals,
      library_write: principals,
    },
  },
};

export const workspaces: SavedObjectsType = {
  name: 'workspaces',
  namespaceType: 'agnostic',
  /**
   * Disable operation by using saved objects APIs on workspace metadata
   */
  hidden: true,
  mappings: {
    type: 'keyword',
  },
};
