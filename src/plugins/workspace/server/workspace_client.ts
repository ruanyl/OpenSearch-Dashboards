/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import type {
  SavedObject,
  SavedObjectsClientContract,
  CoreSetup,
  WorkspaceAttribute,
  SavedObjectsServiceStart,
  Logger,
  Permissions,
} from '../../../core/server';
import {
  ACL,
  DEFAULT_APP_CATEGORIES,
  PUBLIC_WORKSPACE_ID,
  WORKSPACE_TYPE,
  WorkspacePermissionMode,
} from '../../../core/server';
import {
  IWorkspaceClientImpl,
  WorkspaceFindOptions,
  IResponse,
  IRequestDetail,
  WorkspaceAttributeWithPermission,
  WorkspacePermissionItem,
} from './types';
import { workspace } from './saved_objects';
import { generateRandomId } from './utils';
import {
  WORKSPACE_OVERVIEW_APP_ID,
  WORKSPACE_SAVED_OBJECTS_CLIENT_WRAPPER_ID,
  WORKSPACE_UPDATE_APP_ID,
} from '../common/constants';

const validatePermissionModesCombinations = [
  [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read], // Read
  [WorkspacePermissionMode.LibraryWrite, WorkspacePermissionMode.Read], // Write
  [WorkspacePermissionMode.LibraryWrite, WorkspacePermissionMode.Write], // Admin
];

const isValidPermissionModesCombination = (permissionModes: string[]) =>
  validatePermissionModesCombinations.some(
    (combination) =>
      combination.length === permissionModes.length &&
      combination.every((mode) => permissionModes.includes(mode))
  );
const validatePermissions = (permissions: WorkspacePermissionItem[]) => {
  const existsUsersOrGroups: { [key: string]: boolean } = {};
  for (const permission of permissions) {
    const key = `${permission.type}${permission.type === 'user' ? `-${permission.userId}` : ''}${
      permission.type === 'group' ? `-${permission.group}` : ''
    }`;
    if (existsUsersOrGroups[key]) {
      throw new Error(DUPLICATE_PERMISSION_SETTING);
    }
    existsUsersOrGroups[key] = true;
    if (!isValidPermissionModesCombination(permission.modes)) {
      throw new Error(INVALID_PERMISSION_MODES_COMBINATION);
    }
  }
};

const convertToACL = (
  workspacePermissions: WorkspacePermissionItem | WorkspacePermissionItem[]
) => {
  workspacePermissions = Array.isArray(workspacePermissions)
    ? workspacePermissions
    : [workspacePermissions];

  const acl = new ACL();

  workspacePermissions.forEach((permission) => {
    switch (permission.type) {
      case 'user':
        acl.addPermission(permission.modes, { users: [permission.userId] });
        return;
      case 'group':
        acl.addPermission(permission.modes, { groups: [permission.group] });
        return;
    }
  });

  return acl.getPermissions() || {};
};

const isValidWorkspacePermissionMode = (mode: string): mode is WorkspacePermissionMode =>
  Object.values(WorkspacePermissionMode).some((modeValue) => modeValue === mode);

const isWorkspacePermissionItem = (
  test: WorkspacePermissionItem | null
): test is WorkspacePermissionItem => test !== null;

const convertFromACL = (permissions: Permissions) => {
  const acl = new ACL(permissions);

  return acl
    .toFlatList()
    .map(({ name, permissions: modes, type }) => {
      const validModes = modes.filter(isValidWorkspacePermissionMode);
      switch (type) {
        case 'users':
          return {
            type: 'user',
            modes: validModes,
            userId: name,
          } as const;
        case 'groups':
          return {
            type: 'group',
            modes: validModes,
            group: name,
          } as const;
        default:
          return null;
      }
    })
    .filter(isWorkspacePermissionItem);
};

const WORKSPACE_ID_SIZE = 6;

const DUPLICATE_WORKSPACE_NAME_ERROR = i18n.translate('workspace.duplicate.name.error', {
  defaultMessage: 'workspace name has already been used, try with a different name',
});

const RESERVED_WORKSPACE_NAME_ERROR = i18n.translate('workspace.reserved.name.error', {
  defaultMessage: 'reserved workspace name cannot be changed',
});

const DUPLICATE_PERMISSION_SETTING = i18n.translate('workspace.invalid.permission.error', {
  defaultMessage: 'Duplicate permission setting',
});

const INVALID_PERMISSION_MODES_COMBINATION = i18n.translate('workspace.invalid.permission.error', {
  defaultMessage: 'Invalid workspace permission mode combination',
});

export class WorkspaceClientWithSavedObject implements IWorkspaceClientImpl {
  private setupDep: CoreSetup;
  private logger: Logger;

  private savedObjects?: SavedObjectsServiceStart;

  constructor(core: CoreSetup, logger: Logger) {
    this.setupDep = core;
    this.logger = logger;
  }

  private getScopedClientWithoutPermission(
    requestDetail: IRequestDetail
  ): SavedObjectsClientContract | undefined {
    return this.savedObjects?.getScopedClient(requestDetail.request, {
      excludedWrappers: [WORKSPACE_SAVED_OBJECTS_CLIENT_WRAPPER_ID],
      includedHiddenTypes: [WORKSPACE_TYPE],
    });
  }

  private getSavedObjectClientsFromRequestDetail(
    requestDetail: IRequestDetail
  ): SavedObjectsClientContract {
    return this.savedObjects?.getScopedClient(requestDetail.request, {
      includedHiddenTypes: [WORKSPACE_TYPE],
    }) as SavedObjectsClientContract;
  }
  private getFlattenedResultWithSavedObject(
    savedObject: SavedObject<WorkspaceAttribute>
  ): WorkspaceAttributeWithPermission {
    return {
      ...savedObject.attributes,
      permissions: savedObject.permissions ? convertFromACL(savedObject.permissions) : undefined,
      id: savedObject.id,
    };
  }
  private formatError(error: Error | any): string {
    return error.message || error.error || 'Error';
  }
  private async checkAndCreateWorkspace(
    savedObjectClient: SavedObjectsClientContract | undefined,
    workspaceId: string,
    workspaceAttribute: Omit<WorkspaceAttribute, 'id' | 'permissions'>,
    permissions?: Permissions
  ) {
    try {
      await savedObjectClient?.get(WORKSPACE_TYPE, workspaceId);
    } catch (error) {
      this.logger.debug(error?.toString() || '');
      this.logger.info(`Workspace ${workspaceId} is not found, create it by using internal user`);
      try {
        const createResult = await savedObjectClient?.create(WORKSPACE_TYPE, workspaceAttribute, {
          id: workspaceId,
          permissions,
        });
        if (createResult?.id) {
          this.logger.info(`Created workspace ${createResult.id}.`);
        }
      } catch (e) {
        this.logger.error(`Create ${workspaceId} workspace error: ${e?.toString() || ''}`);
      }
    }
  }
  private async setupPublicWorkspace(savedObjectClient?: SavedObjectsClientContract) {
    const publicWorkspaceACL = new ACL().addPermission(
      [WorkspacePermissionMode.LibraryWrite, WorkspacePermissionMode.Write],
      {
        users: ['*'],
      }
    );
    return this.checkAndCreateWorkspace(
      savedObjectClient,
      PUBLIC_WORKSPACE_ID,
      {
        name: i18n.translate('workspaces.public.workspace.default.name', {
          defaultMessage: 'Global workspace',
        }),
        features: ['*', `!@${DEFAULT_APP_CATEGORIES.management.id}`],
        reserved: true,
      },
      publicWorkspaceACL.getPermissions()
    );
  }

  public async setup(core: CoreSetup): Promise<IResponse<boolean>> {
    this.setupDep.savedObjects.registerType(workspace);
    return {
      success: true,
      result: true,
    };
  }
  public async create(
    requestDetail: IRequestDetail,
    payload: Omit<WorkspaceAttributeWithPermission, 'id'>
  ): ReturnType<IWorkspaceClientImpl['create']> {
    try {
      const { permissions, ...attributes } = payload;
      const id = generateRandomId(WORKSPACE_ID_SIZE);
      const client = this.getSavedObjectClientsFromRequestDetail(requestDetail);
      const existingWorkspaceRes = await this.getScopedClientWithoutPermission(requestDetail)?.find(
        {
          type: WORKSPACE_TYPE,
          search: attributes.name,
          searchFields: ['name'],
          flags: 'NONE', // disable all operators, treat workspace as literal string
        }
      );
      if (existingWorkspaceRes && existingWorkspaceRes.total > 0) {
        throw new Error(DUPLICATE_WORKSPACE_NAME_ERROR);
      }

      if (permissions) {
        validatePermissions(permissions);
      }

      const result = await client.create<Omit<WorkspaceAttribute, 'id'>>(
        WORKSPACE_TYPE,
        attributes,
        {
          id,
          permissions: permissions ? convertToACL(permissions) : undefined,
        }
      );
      return {
        success: true,
        result: {
          id: result.id,
        },
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: this.formatError(e),
      };
    }
  }
  public async list(
    requestDetail: IRequestDetail,
    options: WorkspaceFindOptions
  ): ReturnType<IWorkspaceClientImpl['list']> {
    try {
      const { permissionModes, ...restOptions } = options;
      const resultResp = await this.getSavedObjectClientsFromRequestDetail(requestDetail).find<
        WorkspaceAttribute
      >({
        ...restOptions,
        type: WORKSPACE_TYPE,
        ...(permissionModes ? { ACLSearchParams: { permissionModes } } : {}),
      });
      const { saved_objects: resultSavedObjects, ...resultOthers } = resultResp;
      let savedObjects = resultSavedObjects;
      let others = resultOthers;
      const scopedClientWithoutPermissionCheck = this.getScopedClientWithoutPermission(
        requestDetail
      );
      const tasks: Array<Promise<unknown>> = [];

      /**
       * Setup public workspace if public workspace can not be found
       */
      const hasPublicWorkspace = savedObjects.some((item) => item.id === PUBLIC_WORKSPACE_ID);

      if (!hasPublicWorkspace) {
        tasks.push(this.setupPublicWorkspace(scopedClientWithoutPermissionCheck));
      }

      try {
        await Promise.all(tasks);
        if (tasks.length) {
          const retryFindResp = await this.getSavedObjectClientsFromRequestDetail(
            requestDetail
          ).find<WorkspaceAttribute>({
            ...restOptions,
            type: WORKSPACE_TYPE,
            ...(permissionModes ? { ACLSearchParams: { permissionModes } } : {}),
          });
          const { saved_objects: retrySavedObjects, ...retryOthers } = retryFindResp;
          savedObjects = retryFindResp.saved_objects;
          others = retryOthers;
        }
      } catch (e) {
        this.logger.error(`Some error happened when initializing reserved workspace: ${e}`);
      }
      return {
        success: true,
        result: {
          ...others,
          workspaces: savedObjects.map((item) => this.getFlattenedResultWithSavedObject(item)),
        },
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: this.formatError(e),
      };
    }
  }
  public async get(
    requestDetail: IRequestDetail,
    id: string
  ): Promise<IResponse<WorkspaceAttributeWithPermission>> {
    try {
      const result = await this.getSavedObjectClientsFromRequestDetail(requestDetail).get<
        WorkspaceAttribute
      >(WORKSPACE_TYPE, id);
      return {
        success: true,
        result: this.getFlattenedResultWithSavedObject(result),
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: this.formatError(e),
      };
    }
  }
  public async update(
    requestDetail: IRequestDetail,
    id: string,
    payload: Omit<WorkspaceAttributeWithPermission, 'id'>
  ): Promise<IResponse<boolean>> {
    const { permissions, ...attributes } = payload;
    try {
      const client = this.getSavedObjectClientsFromRequestDetail(requestDetail);
      const workspaceInDB: SavedObject<WorkspaceAttribute> = await client.get(WORKSPACE_TYPE, id);
      if (workspaceInDB.attributes.name !== attributes.name) {
        if (workspaceInDB.attributes.reserved) {
          throw new Error(RESERVED_WORKSPACE_NAME_ERROR);
        }
        const existingWorkspaceRes = await this.getScopedClientWithoutPermission(
          requestDetail
        )?.find({
          type: WORKSPACE_TYPE,
          search: attributes.name,
          searchFields: ['name'],
          fields: ['_id'],
          flags: 'NONE', // disable all operators, treat workspace as literal string
        });
        if (existingWorkspaceRes && existingWorkspaceRes.total > 0) {
          throw new Error(DUPLICATE_WORKSPACE_NAME_ERROR);
        }
      }

      if (permissions) {
        validatePermissions(permissions);
      }

      await client.create<Omit<WorkspaceAttribute, 'id'>>(WORKSPACE_TYPE, attributes, {
        id,
        permissions: permissions ? convertToACL(permissions) : undefined,
        overwrite: true,
        version: workspaceInDB.version,
      });

      return {
        success: true,
        result: true,
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: this.formatError(e),
      };
    }
  }
  public async delete(requestDetail: IRequestDetail, id: string): Promise<IResponse<boolean>> {
    try {
      const savedObjectClient = this.getSavedObjectClientsFromRequestDetail(requestDetail);
      const workspaceInDB: SavedObject<WorkspaceAttribute> = await savedObjectClient.get(
        WORKSPACE_TYPE,
        id
      );
      if (workspaceInDB.attributes.reserved) {
        return {
          success: false,
          error: i18n.translate('workspace.deleteReservedWorkspace.errorMessage', {
            defaultMessage: 'Reserved workspace {id} is not allowed to delete.',
            values: { id: workspaceInDB.id },
          }),
        };
      }
      await savedObjectClient.deleteByWorkspace(id);
      // delete workspace itself at last, deleteByWorkspace depends on the workspace to do permission check
      await savedObjectClient.delete(WORKSPACE_TYPE, id);
      return {
        success: true,
        result: true,
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: this.formatError(e),
      };
    }
  }
  public setSavedObjects(savedObjects: SavedObjectsServiceStart) {
    this.savedObjects = savedObjects;
  }
  public async destroy(): Promise<IResponse<boolean>> {
    return {
      success: true,
      result: true,
    };
  }
}
