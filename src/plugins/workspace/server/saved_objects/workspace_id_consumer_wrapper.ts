/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SavedObjectsBaseOptions,
  SavedObjectsBulkCreateObject,
  SavedObjectsClientWrapperFactory,
  SavedObjectsCreateOptions,
  SavedObjectsCheckConflictsObject,
  OpenSearchDashboardsRequest,
  SavedObjectsFindOptions,
  SavedObjectsUpdateOptions,
  SavedObjectsBulkUpdateOptions,
  SavedObjectsBulkUpdateObject,
  WORKSPACE_TYPE,
} from '../../../../core/server';
import { workspaceIdInUrlSymbol } from '../constant';

type WorkspaceOptions =
  | {
      workspaces?: string[];
    }
  | undefined;

export class WorkspaceIdConsumerWrapper {
  private typeRelatedToWorkspace(type: string | string[]): boolean {
    if (Array.isArray(type)) {
      return type.some((item) => item === WORKSPACE_TYPE);
    }

    return type === WORKSPACE_TYPE;
  }
  private formatWorkspaceIdParams<T extends WorkspaceOptions>(
    request: OpenSearchDashboardsRequest,
    options: T
  ): T {
    if (!options) {
      return options;
    }
    const { workspaces, ...others } = options;
    const workspaceIdParsedFromUrl = request.headers[workspaceIdInUrlSymbol.toString()] as string;
    const workspaceIdInUserOptions = options.workspaces;
    let finalWorkspaces: string[] = [];
    if (workspaceIdInUserOptions?.length) {
      finalWorkspaces = workspaceIdInUserOptions;
    } else if (workspaceIdParsedFromUrl) {
      finalWorkspaces = [workspaceIdParsedFromUrl];
    }

    return {
      ...(others as T),
      ...(finalWorkspaces.length ? { workspaces: finalWorkspaces } : {}),
    };
  }
  public wrapperFactory: SavedObjectsClientWrapperFactory = (wrapperOptions) => {
    return {
      ...wrapperOptions.client,
      create: <T>(type: string, attributes: T, options: SavedObjectsCreateOptions = {}) =>
        wrapperOptions.client.create(
          type,
          attributes,
          this.formatWorkspaceIdParams(wrapperOptions.request, options)
        ),
      bulkCreate: <T = unknown>(
        objects: Array<SavedObjectsBulkCreateObject<T>>,
        options: SavedObjectsCreateOptions = {}
      ) =>
        wrapperOptions.client.bulkCreate(
          objects,
          this.formatWorkspaceIdParams(wrapperOptions.request, options)
        ),
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
          this.typeRelatedToWorkspace(options.type)
            ? options
            : this.formatWorkspaceIdParams(wrapperOptions.request, options)
        ),
      bulkGet: wrapperOptions.client.bulkGet,
      get: wrapperOptions.client.get,
      update: <T = unknown>(
        type: string,
        id: string,
        attributes: Partial<T>,
        options: SavedObjectsUpdateOptions = {}
      ) =>
        wrapperOptions.client.update(
          type,
          id,
          attributes,
          this.formatWorkspaceIdParams(wrapperOptions.request, options)
        ),
      bulkUpdate: <T = unknown>(
        objects: Array<SavedObjectsBulkUpdateObject<T>>,
        options?: SavedObjectsBulkUpdateOptions
      ) =>
        wrapperOptions.client.bulkUpdate(
          objects,
          this.formatWorkspaceIdParams(wrapperOptions.request, options)
        ),
      addToNamespaces: wrapperOptions.client.addToNamespaces,
      deleteFromNamespaces: wrapperOptions.client.deleteFromNamespaces,
    };
  };

  constructor() {}
}
