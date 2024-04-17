/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getWorkspaceState } from '../../../../core/server/utils';
import {
  SavedObjectsBaseOptions,
  SavedObjectsBulkCreateObject,
  SavedObjectsClientWrapperFactory,
  SavedObjectsCreateOptions,
  SavedObjectsCheckConflictsObject,
  OpenSearchDashboardsRequest,
  SavedObjectsFindOptions,
  SavedObjectsErrorHelpers,
  SavedObject,
} from '../../../../core/server';
import { DATA_SOURCE_SAVED_OBJECT_TYPE } from '../../../../plugins/data_source/common';

type WorkspaceOptions = Pick<SavedObjectsBaseOptions, 'workspaces'> | undefined;

const UI_SETTINGS_SAVED_OBJECTS_TYPE = 'config';

export class WorkspaceIdConsumerWrapper {
  private formatWorkspaceIdParams<T extends WorkspaceOptions>(
    request: OpenSearchDashboardsRequest,
    options?: T
  ): T {
    const { workspaces, ...others } = options || {};
    const workspaceState = getWorkspaceState(request);
    const workspaceIdParsedFromRequest = workspaceState?.requestWorkspaceId;
    const workspaceIdsInUserOptions = options?.workspaces;
    let finalWorkspaces: string[] = [];
    if (options?.hasOwnProperty('workspaces')) {
      finalWorkspaces = workspaceIdsInUserOptions || [];
    } else if (workspaceIdParsedFromRequest) {
      finalWorkspaces = [workspaceIdParsedFromRequest];
    }

    return {
      ...(others as T),
      ...(finalWorkspaces.length ? { workspaces: finalWorkspaces } : {}),
    };
  }
  private isDataSourceType(type: SavedObjectsFindOptions['type']): boolean {
    if (Array.isArray(type)) {
      return type.every((item) => item === DATA_SOURCE_SAVED_OBJECT_TYPE);
    }

    return type === DATA_SOURCE_SAVED_OBJECT_TYPE;
  }
  private isConfigType(type: SavedObject['type']): boolean {
    return type === UI_SETTINGS_SAVED_OBJECTS_TYPE;
  }
  private formatFindParams(options: SavedObjectsFindOptions): SavedObjectsFindOptions {
    const isListingDataSource = this.isDataSourceType(options.type);
    return isListingDataSource ? { ...options, workspaces: null } : options;
  }
  public wrapperFactory: SavedObjectsClientWrapperFactory = (wrapperOptions) => {
    return {
      ...wrapperOptions.client,
      create: <T>(type: string, attributes: T, options: SavedObjectsCreateOptions = {}) => {
        const { workspaces } = this.formatWorkspaceIdParams(wrapperOptions.request, options);
        if (workspaces?.length && (this.isDataSourceType(type) || this.isConfigType(type))) {
          // For 2.14, data source can only be created without workspace info
          // config can not be created inside a workspace
          throw SavedObjectsErrorHelpers.decorateBadRequestError(
            new Error(`'${type}' is not allowed to create in workspace.`),
            'Unsupport type in workspace'
          );
        }

        return wrapperOptions.client.create(
          type,
          attributes,
          this.formatWorkspaceIdParams(wrapperOptions.request, options)
        );
      },
      bulkCreate: async <T = unknown>(
        objects: Array<SavedObjectsBulkCreateObject<T>>,
        options: SavedObjectsCreateOptions = {}
      ) => {
        const { workspaces } = this.formatWorkspaceIdParams(wrapperOptions.request, options);
        const disallowedSavedObjects: Array<SavedObjectsBulkCreateObject<T>> = [];
        const allowedSavedObjects: Array<SavedObjectsBulkCreateObject<T>> = [];
        objects.forEach((item) => {
          const isImportIntoWorkspace = workspaces?.length || item.workspaces?.length;
          // config can not be created inside a workspace
          if (this.isConfigType(item.type) && isImportIntoWorkspace) {
            disallowedSavedObjects.push(item);
            return;
          }

          // For 2.14, data source can only be created without workspace info
          if (this.isDataSourceType(item.type) && isImportIntoWorkspace) {
            disallowedSavedObjects.push(item);
            return;
          }

          allowedSavedObjects.push(item);
          return;
        });

        if (!disallowedSavedObjects.length) {
          return await wrapperOptions.client.bulkCreate(
            objects,
            this.formatWorkspaceIdParams(wrapperOptions.request, options)
          );
        }

        const allowedSavedObjectsBulkCreateResult = await wrapperOptions.client.bulkCreate(
          allowedSavedObjects,
          this.formatWorkspaceIdParams(wrapperOptions.request, options)
        );

        return {
          saved_objects: [
            ...allowedSavedObjectsBulkCreateResult.saved_objects,
            ...disallowedSavedObjects.map((item) => ({
              references: [],
              id: '',
              ...item,
              error: {
                ...SavedObjectsErrorHelpers.decorateBadRequestError(
                  new Error(`'${item.type}' is not allowed to import in workspace.`),
                  'Unsupport type in workspace'
                ).output.payload,
                metadata: { isNotOverwritable: true },
              },
            })),
          ],
        };
      },
      checkConflicts: (
        objects: SavedObjectsCheckConflictsObject[] = [],
        options: SavedObjectsBaseOptions = {}
      ) =>
        wrapperOptions.client.checkConflicts(
          objects,
          this.formatWorkspaceIdParams(wrapperOptions.request, options)
        ),
      delete: wrapperOptions.client.delete,
      find: (options: SavedObjectsFindOptions) =>
        wrapperOptions.client.find(
          this.formatWorkspaceIdParams(
            wrapperOptions.request,
            // The `formatFindParams` is a workaroud for 2.14 to always list global data sources,
            // should remove this workaround in 2.15 once readonly share is available
            this.formatFindParams(options)
          )
        ),
      bulkGet: wrapperOptions.client.bulkGet,
      get: wrapperOptions.client.get,
      update: wrapperOptions.client.update,
      bulkUpdate: wrapperOptions.client.bulkUpdate,
      addToNamespaces: wrapperOptions.client.addToNamespaces,
      deleteFromNamespaces: wrapperOptions.client.deleteFromNamespaces,
      deleteByWorkspace: wrapperOptions.client.deleteByWorkspace,
    };
  };

  constructor() {}
}
