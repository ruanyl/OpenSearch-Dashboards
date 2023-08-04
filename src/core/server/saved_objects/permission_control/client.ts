/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenSearchDashboardsRequest } from '../../http';
import { ensureRawRequest } from '../../http/router';
import { SavedObjectsServiceStart } from '../saved_objects_service';
import { SavedObjectsBulkGetObject } from '../service';
import { ACL, Principals, TransformedPermission } from './acl';
import { PrincipalType } from '../../../utils/constants';
import { WORKSPACE_TYPE } from '../../workspaces';

export type SavedObjectsPermissionControlContract = Pick<
  SavedObjectsPermissionControl,
  keyof SavedObjectsPermissionControl
>;

export type SavedObjectsPermissionModes = string[];

export interface AuthInfo {
  backend_roles?: string[];
  user_name?: string;
}

export class SavedObjectsPermissionControl {
  private createScopedRepository?: SavedObjectsServiceStart['createScopedRepository'];
  private getScopedRepository(request: OpenSearchDashboardsRequest) {
    return this.createScopedRepository?.(request);
  }
  public getPrincipalsFromRequest(request: OpenSearchDashboardsRequest): Principals {
    const rawRequest = ensureRawRequest(request);
    const authInfo = rawRequest?.auth?.credentials?.authInfo as AuthInfo | null;
    const payload: Principals = {};
    if (authInfo?.backend_roles) {
      payload[PrincipalType.Groups] = authInfo.backend_roles;
    }
    if (authInfo?.user_name) {
      payload[PrincipalType.Users] = [authInfo.user_name];
    }
    return payload;
  }
  private async bulkGetSavedObjects(
    request: OpenSearchDashboardsRequest,
    savedObjects: SavedObjectsBulkGetObject[]
  ) {
    return (await this.getScopedRepository(request)?.bulkGet(savedObjects))?.saved_objects || [];
  }
  public async setup(createScopedRepository: SavedObjectsServiceStart['createScopedRepository']) {
    this.createScopedRepository = createScopedRepository;
  }
  public async validate(
    request: OpenSearchDashboardsRequest,
    savedObject: SavedObjectsBulkGetObject,
    permissionModeOrModes: SavedObjectsPermissionModes
  ) {
    return await this.batchValidate(request, [savedObject], permissionModeOrModes);
  }

  /**
   * In batch validate case, the logic is a.withPermission && b.withPermission
   * @param request
   * @param savedObjects
   * @param permissionModeOrModes
   * @returns
   */
  public async batchValidate(
    request: OpenSearchDashboardsRequest,
    savedObjects: SavedObjectsBulkGetObject[],
    permissionModeOrModes: SavedObjectsPermissionModes
  ) {
    const savedObjectsGet = await this.bulkGetSavedObjects(request, savedObjects);
    if (savedObjectsGet) {
      const principals = this.getPrincipalsFromRequest(request);
      const hasAllPermission = savedObjectsGet.every((item) => {
        // item.permissions
        const aclInstance = new ACL(item.permissions);
        return aclInstance.hasPermission(permissionModeOrModes, principals);
      });
      return {
        success: true,
        result: hasAllPermission,
      };
    }

    return {
      success: false,
      error: 'Can not find target saved objects.',
    };
  }

  public async getPrincipalsOfObjects(
    request: OpenSearchDashboardsRequest,
    savedObjects: SavedObjectsBulkGetObject[]
  ): Promise<Record<string, TransformedPermission>> {
    const detailedSavedObjects = await this.bulkGetSavedObjects(request, savedObjects);
    return detailedSavedObjects.reduce((total, current) => {
      return {
        ...total,
        [current.id]: new ACL(current.permissions).transformPermissions(),
      };
    }, {});
  }

  public async getPermittedWorkspaceIds(
    request: OpenSearchDashboardsRequest,
    permissionModeOrModes: SavedObjectsPermissionModes
  ) {
    const principals = this.getPrincipalsFromRequest(request);
    const queryDSL = ACL.genereateGetPermittedSavedObjectsQueryDSL(
      permissionModeOrModes,
      principals,
      [WORKSPACE_TYPE]
    );
    const repository = this.createScopedRepository?.(request);
    try {
      const result = await repository?.find({
        type: [WORKSPACE_TYPE],
        queryDSL,
      });
      return result?.saved_objects.map((item) => item.id);
    } catch (e) {
      return [];
    }
  }
}
