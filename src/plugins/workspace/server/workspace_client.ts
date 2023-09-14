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
} from '../../../core/server';
import { WORKSPACE_TYPE } from '../../../core/server';
import {
  IWorkspaceDBImpl,
  WorkspaceFindOptions,
  IResponse,
  IRequestDetail,
  WorkspaceAttributeWithPermission,
} from './types';
import { workspace } from './saved_objects';
import { generateRandomId } from './utils';
import { WORKSPACE_SAVED_OBJECTS_CLIENT_WRAPPER_ID } from '../common/constants';

const WORKSPACE_ID_SIZE = 6;

const DUPLICATE_WORKSPACE_NAME_ERROR = i18n.translate('workspace.duplicate.name.error', {
  defaultMessage: 'workspace name has already been used, try with a different name',
});

export class WorkspaceClientWithSavedObject implements IWorkspaceDBImpl {
  private setupDep: CoreSetup;

  private savedObjects?: SavedObjectsServiceStart;

  setSavedObjectes(savedObjects: SavedObjectsServiceStart) {
    this.savedObjects = savedObjects;
  }

  private getScopeClientWithoutPermisson(
    requestDetail: IRequestDetail
  ): SavedObjectsClientContract | undefined {
    return this.savedObjects?.getScopedClient(requestDetail.request, {
      excludedWrappers: [WORKSPACE_SAVED_OBJECTS_CLIENT_WRAPPER_ID],
    });
  }

  constructor(core: CoreSetup) {
    this.setupDep = core;
  }
  private getSavedObjectClientsFromRequestDetail(
    requestDetail: IRequestDetail
  ): SavedObjectsClientContract {
    return requestDetail.context.core.savedObjects.client;
  }
  private getFlattenedResultWithSavedObject(
    savedObject: SavedObject<WorkspaceAttribute>
  ): WorkspaceAttributeWithPermission {
    return {
      ...savedObject.attributes,
      permissions: savedObject.permissions || {},
      id: savedObject.id,
    };
  }
  private formatError(error: Error | any): string {
    return error.message || error.error || 'Error';
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
  ): ReturnType<IWorkspaceDBImpl['create']> {
    try {
      const { permissions, ...attributes } = payload;
      const id = generateRandomId(WORKSPACE_ID_SIZE);
      const client = this.getSavedObjectClientsFromRequestDetail(requestDetail);
      const existingWorkspaceRes = await this.getScopeClientWithoutPermisson(requestDetail)?.find({
        type: WORKSPACE_TYPE,
        search: attributes.name,
        searchFields: ['name'],
      });
      if (existingWorkspaceRes && existingWorkspaceRes.total > 0) {
        throw new Error(DUPLICATE_WORKSPACE_NAME_ERROR);
      }
      const result = await client.create<Omit<WorkspaceAttribute, 'id'>>(
        WORKSPACE_TYPE,
        attributes,
        {
          id,
          permissions,
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
  ): ReturnType<IWorkspaceDBImpl['list']> {
    try {
      const {
        saved_objects: savedObjects,
        ...others
      } = await this.getSavedObjectClientsFromRequestDetail(requestDetail).find<WorkspaceAttribute>(
        {
          ...options,
          type: WORKSPACE_TYPE,
        }
      );
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
        const existingWorkspaceRes = await this.getScopeClientWithoutPermisson(requestDetail)?.find(
          {
            type: WORKSPACE_TYPE,
            search: attributes.name,
            searchFields: ['name'],
            fields: ['_id'],
          }
        );
        if (existingWorkspaceRes && existingWorkspaceRes.total > 0) {
          throw new Error(DUPLICATE_WORKSPACE_NAME_ERROR);
        }
      }

      await client.create<Omit<WorkspaceAttribute, 'id'>>(WORKSPACE_TYPE, attributes, {
        id,
        permissions,
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
            defaultMessage: 'Reserved workspace {id} is not allowed to delete: ',
            values: { id: workspaceInDB.id },
          }),
        };
      }
      await savedObjectClient.delete(WORKSPACE_TYPE, id);
      await savedObjectClient.deleteByWorkspace(id);
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
  public async destroy(): Promise<IResponse<boolean>> {
    return {
      success: true,
      result: true,
    };
  }
}
