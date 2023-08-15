/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { i18n } from '@osd/i18n';
import type { SavedObject, SavedObjectsClientContract, CoreSetup } from '../../../core/server';
import { MANAGEMENT_WORKSPACE, PUBLIC_WORKSPACE, WORKSPACE_TYPE } from '../../../core/server';
import {
  IWorkspaceDBImpl,
  WorkspaceAttribute,
  WorkspaceFindOptions,
  IResponse,
  IRequestDetail,
  WorkspaceAttributeWithPermission,
} from './types';
import { workspace } from './saved_objects';

export class WorkspaceClientWithSavedObject implements IWorkspaceDBImpl {
  private setupDep: CoreSetup;
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
      const result = await this.getSavedObjectClientsFromRequestDetail(requestDetail).create<
        Omit<WorkspaceAttribute, 'id'>
      >(WORKSPACE_TYPE, attributes, {
        permissions,
      });
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
      await this.getSavedObjectClientsFromRequestDetail(requestDetail).update<
        Omit<WorkspaceAttribute, 'id'>
      >(WORKSPACE_TYPE, id, attributes, {
        permissions,
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
      if (id === PUBLIC_WORKSPACE || id === MANAGEMENT_WORKSPACE) {
        return {
          success: false,
          error: i18n.translate('workspace.deleteReservedWorkspace.errorMessage', {
            defaultMessage: 'reserved workspace is not allowed to delete: ' + id,
          }),
        };
      }
      const savedObjectClient = this.getSavedObjectClientsFromRequestDetail(requestDetail);
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
