/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import Boom from '@hapi/boom';

import {
  OpenSearchDashboardsRequest,
  SavedObject,
  SavedObjectsAddToWorkspacesOptions,
  SavedObjectsBaseOptions,
  SavedObjectsBulkCreateObject,
  SavedObjectsBulkGetObject,
  SavedObjectsBulkResponse,
  SavedObjectsClientWrapperFactory,
  SavedObjectsCreateOptions,
  SavedObjectsDeleteOptions,
  SavedObjectsFindOptions,
  SavedObjectsShareObjects,
  SavedObjectsUpdateOptions,
  SavedObjectsUpdateResponse,
  SavedObjectsBulkUpdateObject,
  SavedObjectsBulkUpdateResponse,
  SavedObjectsBulkUpdateOptions,
  SavedObjectsPermissionControlContract,
  WORKSPACE_TYPE,
  ACL,
  WorkspacePermissionMode,
} from '../../../../core/server';

// Can't throw unauthorized for now, the page will be refreshed if unauthorized
const generateWorkspacePermissionError = () =>
  Boom.illegal(
    i18n.translate('workspace.permission.invalidate', {
      defaultMessage: 'Invalid workspace permission',
    })
  );

const generateSavedObjectsPermissionError = () =>
  Boom.illegal(
    i18n.translate('saved_objects.permission.invalidate', {
      defaultMessage: 'Invalid saved objects permission',
    })
  );

interface AttributesWithWorkspaces {
  workspaces: string[];
}

const isWorkspacesLikeAttributes = (attributes: unknown): attributes is AttributesWithWorkspaces =>
  typeof attributes === 'object' &&
  !!attributes &&
  attributes.hasOwnProperty('workspaces') &&
  Array.isArray((attributes as { workspaces: unknown }).workspaces);

export class WorkspaceSavedObjectsClientWrapper {
  private formatWorkspacePermissionModeToStringArray(
    permission: WorkspacePermissionMode | WorkspacePermissionMode[]
  ): string[] {
    if (Array.isArray(permission)) {
      return permission;
    }

    return [permission];
  }
  private async validateSingleObjectPermissions(
    id: string | undefined,
    type: string,
    request: OpenSearchDashboardsRequest,
    permissionMode: WorkspacePermissionMode | WorkspacePermissionMode[]
  ) {
    // PermissionMode here is an array which is merged by workspace type required permission and other saved object required permission.
    // So we only need to do one permission check no matter its type.
    if (!id) {
      return;
    }
    const validateResult = await this.permissionControl.validate(
      request,
      {
        type,
        id,
      },
      this.formatWorkspacePermissionModeToStringArray(permissionMode)
    );
    if (!validateResult?.result) {
      throw generateWorkspacePermissionError();
    }
  }

  private async validateMultiObjectsPermissions(
    objects: Array<Pick<SavedObject, 'id' | 'type'>>,
    request: OpenSearchDashboardsRequest,
    permissionMode: WorkspacePermissionMode | WorkspacePermissionMode[]
  ) {
    // PermissionMode here is an array which is merged by workspace type required permission and other saved object required permission.
    // So we only need to do one permission check no matter its type.
    let permitted = true;

    for (const { id, type } of objects) {
      const validateResult = await this.permissionControl.validate(
        request,
        {
          type,
          id,
        },
        this.formatWorkspacePermissionModeToStringArray(permissionMode)
      );
      if (!validateResult?.result) {
        permitted = false;
        break;
      }
      return permitted;
    }
  }

  private async validateMultiWorkspacesPermissions(
    workspacesIds: string[],
    request: OpenSearchDashboardsRequest,
    permissionMode: WorkspacePermissionMode | WorkspacePermissionMode[]
  ) {
    const workspaces = workspacesIds.map((id) => ({ id, type: WORKSPACE_TYPE }));
    return await this.validateMultiObjectsPermissions(workspaces, request, permissionMode);
  }

  private async validateWorkspaceAttributesPermitted<T = unknown>(
    attributes: Partial<T> | T,
    request: OpenSearchDashboardsRequest,
    permissionMode: WorkspacePermissionMode | WorkspacePermissionMode[]
  ) {
    if (isWorkspacesLikeAttributes(attributes)) {
      return await this.validateMultiWorkspacesPermissions(
        attributes.workspaces,
        request,
        permissionMode
      );
    }
    return false;
  }

  private async validateAtLeastOnePermittedWorkspaces(
    workspaces: string[] | undefined,
    request: OpenSearchDashboardsRequest,
    permissionMode: WorkspacePermissionMode | WorkspacePermissionMode[]
  ) {
    if (!workspaces) {
      return;
    }
    let permitted = false;
    for (const workspaceId of workspaces) {
      if (
        await this.permissionControl.validate(
          request,
          {
            type: WORKSPACE_TYPE,
            id: workspaceId,
          },
          this.formatWorkspacePermissionModeToStringArray(permissionMode)
        )
      ) {
        permitted = true;
        break;
      }
    }
    return permitted;
  }

  /**
   * check if the type include workspace
   * Workspace permission check is totally different from object permission check.
   * @param type
   * @returns
   */
  private isRelatedToWorkspace(type: string | string[]): boolean {
    return type === WORKSPACE_TYPE || (Array.isArray(type) && type.includes(WORKSPACE_TYPE));
  }

  public wrapperFactory: SavedObjectsClientWrapperFactory = (wrapperOptions) => {
    const deleteWithWorkspacePermissionControl = async (
      type: string,
      id: string,
      options: SavedObjectsDeleteOptions = {}
    ) => {
      const objectToDeleted = await wrapperOptions.client.get(type, id, options);
      const workspacePermitted = await this.validateMultiWorkspacesPermissions(
        objectToDeleted.workspaces!,
        wrapperOptions.request,
        WorkspacePermissionMode.Management
      );

      if (!workspacePermitted) {
        const objectsPermitted = await this.validateMultiObjectsPermissions(
          [{ type, id }],
          wrapperOptions.request,
          [WorkspacePermissionMode.Management, WorkspacePermissionMode.Write]
        );
        if (!objectsPermitted) {
          throw generateSavedObjectsPermissionError();
        }
      }
      return await wrapperOptions.client.delete(type, id, options);
    };

    const updateWithWorkspacePermissionControl = async <T = unknown>(
      type: string,
      id: string,
      attributes: Partial<T>,
      options: SavedObjectsUpdateOptions = {}
    ): Promise<SavedObjectsUpdateResponse<T>> => {
      const workspacePermitted = await this.validateWorkspaceAttributesPermitted(
        attributes,
        wrapperOptions.request,
        WorkspacePermissionMode.Management
      );

      if (!workspacePermitted) {
        await this.validateSingleObjectPermissions(id, type, wrapperOptions.request, [
          WorkspacePermissionMode.Management,
          WorkspacePermissionMode.Write,
        ]);
      }
      return await wrapperOptions.client.update(type, id, attributes, options);
    };

    const bulkUpdateWithWorkspacePermissionControl = async <T = unknown>(
      objects: Array<SavedObjectsBulkUpdateObject<T>>,
      options?: SavedObjectsBulkUpdateOptions
    ): Promise<SavedObjectsBulkUpdateResponse<T>> => {
      for (const object of objects) {
        const workspacePermitted = await this.validateWorkspaceAttributesPermitted(
          object.attributes,
          wrapperOptions.request,
          WorkspacePermissionMode.Management
        );

        if (!workspacePermitted) {
          await this.validateSingleObjectPermissions(
            object.id,
            object.type,
            wrapperOptions.request,
            [WorkspacePermissionMode.Management, WorkspacePermissionMode.Write]
          );
        }
      }

      return await wrapperOptions.client.bulkUpdate(objects, options);
    };

    const bulkCreateWithWorkspacePermissionControl = async <T = unknown>(
      objects: Array<SavedObjectsBulkCreateObject<T>>,
      options: SavedObjectsCreateOptions = {}
    ): Promise<SavedObjectsBulkResponse<T>> => {
      if (options.workspaces) {
        const permitted = await this.validateMultiWorkspacesPermissions(
          options.workspaces,
          wrapperOptions.request,
          [WorkspacePermissionMode.Write, WorkspacePermissionMode.Management]
        );
        if (!permitted) {
          throw generateSavedObjectsPermissionError();
        }
      }
      return await wrapperOptions.client.bulkCreate(objects, options);
    };

    const createWithWorkspacePermissionControl = async <T = unknown>(
      type: string,
      attributes: T,
      options?: SavedObjectsCreateOptions
    ) => {
      const workspacePermitted = await this.validateWorkspaceAttributesPermitted(
        attributes,
        wrapperOptions.request,
        WorkspacePermissionMode.Management
      );
      if (!workspacePermitted) {
        throw generateWorkspacePermissionError();
      }

      return await wrapperOptions.client.create(type, attributes, options);
    };

    const getWithWorkspacePermissionControl = async <T = unknown>(
      type: string,
      id: string,
      options: SavedObjectsBaseOptions = {}
    ): Promise<SavedObject<T>> => {
      const objectToGet = await wrapperOptions.client.get<T>(type, id, options);
      const workspacePermitted = await this.validateAtLeastOnePermittedWorkspaces(
        objectToGet.workspaces,
        wrapperOptions.request,
        WorkspacePermissionMode.Read
      );

      if (!workspacePermitted) {
        await this.validateSingleObjectPermissions(id, type, wrapperOptions.request, [
          WorkspacePermissionMode.LibraryRead,
          WorkspacePermissionMode.LibraryWrite,
          WorkspacePermissionMode.Management,
          WorkspacePermissionMode.Read,
          WorkspacePermissionMode.Write,
        ]);
      }
      return objectToGet;
    };

    const bulkGetWithWorkspacePermissionControl = async <T = unknown>(
      objects: SavedObjectsBulkGetObject[] = [],
      options: SavedObjectsBaseOptions = {}
    ): Promise<SavedObjectsBulkResponse<T>> => {
      const nonWorkspacePermittedObjects = [];
      const objectToBulkGet = await wrapperOptions.client.bulkGet<T>(objects, options);

      for (const object of objectToBulkGet.saved_objects) {
        const workspacePermitted = await this.validateAtLeastOnePermittedWorkspaces(
          object.workspaces,
          wrapperOptions.request,
          WorkspacePermissionMode.Read
        );
        if (!workspacePermitted) {
          nonWorkspacePermittedObjects.push(object);
        }
      }

      if (nonWorkspacePermittedObjects.length > 0) {
        const objectsPermitted = this.permissionControl.batchValidate(
          wrapperOptions.request,
          nonWorkspacePermittedObjects,
          [
            WorkspacePermissionMode.LibraryRead,
            WorkspacePermissionMode.LibraryWrite,
            WorkspacePermissionMode.Management,
            WorkspacePermissionMode.Write,
            WorkspacePermissionMode.Read,
          ]
        );
        if (!objectsPermitted) {
          throw generateSavedObjectsPermissionError();
        }
      }

      return objectToBulkGet;
    };

    const findWithWorkspacePermissionControl = async <T = unknown>(
      options: SavedObjectsFindOptions
    ) => {
      const principals = this.permissionControl.getPrincipalsFromRequest(wrapperOptions.request);

      if (this.isRelatedToWorkspace(options.type)) {
        const queryDSLForQueryingWorkspaces = ACL.genereateGetPermittedSavedObjectsQueryDSL(
          [
            WorkspacePermissionMode.LibraryRead,
            WorkspacePermissionMode.LibraryWrite,
            WorkspacePermissionMode.Management,
          ],
          principals,
          WORKSPACE_TYPE
        );
        options.queryDSL = queryDSLForQueryingWorkspaces;
      } else {
        const permittedWorkspaceIds = await this.permissionControl.getPermittedWorkspaceIds(
          wrapperOptions.request,
          [
            WorkspacePermissionMode.LibraryRead,
            WorkspacePermissionMode.LibraryWrite,
            WorkspacePermissionMode.Management,
          ]
        );
        if (options.workspaces) {
          const isEveryWorkspaceIsPermitted = options.workspaces.every((item) =>
            (permittedWorkspaceIds || []).includes(item)
          );
          if (!isEveryWorkspaceIsPermitted) {
            throw generateWorkspacePermissionError();
          }
        } else {
          const queryDSL = ACL.genereateGetPermittedSavedObjectsQueryDSL(
            [WorkspacePermissionMode.Read, WorkspacePermissionMode.Write],
            principals,
            options.type
          );
          options.workspaces = undefined;
          /**
           * Select all the docs that
           * 1. ACL matches read or write permission OR
           * 2. workspaces matches library_read or library_write or management OR
           * 3. Advanced settings
           */
          options.queryDSL = {
            query: {
              bool: {
                filter: [
                  {
                    bool: {
                      should: [
                        {
                          term: {
                            type: 'config',
                          },
                        },
                        queryDSL.query,
                        {
                          terms: {
                            workspaces: permittedWorkspaceIds,
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          };
        }
      }

      return await wrapperOptions.client.find<T>(options);
    };

    const addToWorkspacesWithPermissionControl = async (
      objects: SavedObjectsShareObjects[],
      targetWorkspaces: string[],
      options: SavedObjectsAddToWorkspacesOptions = {}
    ) => {
      // target workspaces
      await this.validateMultiWorkspacesPermissions(targetWorkspaces, wrapperOptions.request, [
        WorkspacePermissionMode.LibraryWrite,
        WorkspacePermissionMode.Management,
      ]);

      // saved_objects
      const permitted = await this.permissionControl.batchValidate(
        wrapperOptions.request,
        objects.map((savedObj) => ({
          ...savedObj,
        })),
        [WorkspacePermissionMode.Write]
      );

      if (!permitted) {
        throw generateSavedObjectsPermissionError();
      }

      return await wrapperOptions.client.addToWorkspaces(objects, targetWorkspaces, options);
    };

    return {
      ...wrapperOptions.client,
      get: getWithWorkspacePermissionControl,
      checkConflicts: wrapperOptions.client.checkConflicts,
      find: findWithWorkspacePermissionControl,
      bulkGet: bulkGetWithWorkspacePermissionControl,
      errors: wrapperOptions.client.errors,
      addToNamespaces: wrapperOptions.client.addToNamespaces,
      deleteFromNamespaces: wrapperOptions.client.deleteFromNamespaces,
      create: createWithWorkspacePermissionControl,
      bulkCreate: bulkCreateWithWorkspacePermissionControl,
      delete: deleteWithWorkspacePermissionControl,
      update: updateWithWorkspacePermissionControl,
      bulkUpdate: bulkUpdateWithWorkspacePermissionControl,
      addToWorkspaces: addToWorkspacesWithPermissionControl,
    };
  };

  constructor(private readonly permissionControl: SavedObjectsPermissionControlContract) {}
}
