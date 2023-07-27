/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenSearchDashboardsRequest } from '../../http';
import { SavedObjectsServiceStart } from '../saved_objects_service';

export enum PermissionMode {
  Read = 'read',
  Write = 'write',
  Management = 'management',
  LibraryRead = 'library_read',
  LibraryWrite = 'library_write',
}

export class SavedObjectsPermissionControl {
  private getScopedClient?: SavedObjectsServiceStart['getScopedClient'];
  public async setup(getScopedClient: SavedObjectsServiceStart['getScopedClient']) {
    this.getScopedClient = getScopedClient;
  }
  private getScopedSavedObjectsClient(request: OpenSearchDashboardsRequest) {
    return this.getScopedClient?.(request);
  }
  public async validate(
    request: OpenSearchDashboardsRequest,
    savedObjectId: string,
    permissionModeOrModes: PermissionMode | PermissionMode[]
  ) {
    return true;
  }

  public async addPrinciplesToObjects(
    request: OpenSearchDashboardsRequest,
    savedObjectIds: string[],
    personas: string[],
    permissionModeOrModes: PermissionMode | PermissionMode[]
  ): Promise<boolean> {
    return true;
  }

  public async removePrinciplesFromObjects(
    request: OpenSearchDashboardsRequest,
    savedObjectIds: string[],
    personas: string[],
    permissionModeOrModes: PermissionMode | PermissionMode[]
  ): Promise<boolean> {
    return true;
  }

  public async getPrinciplesOfObjects(
    request: OpenSearchDashboardsRequest,
    savedObjectIds: string[]
  ): Promise<Record<string, unknown>> {
    return {};
  }

  public async getPermittedWorkspaceIds(
    request: OpenSearchDashboardsRequest,
    permissionModeOrModes: PermissionMode | PermissionMode[]
  ) {
    return [];
  }
}
