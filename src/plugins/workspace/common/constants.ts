/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkspacePermissionMode } from '../../../core/public';

export const WORKSPACE_CREATE_APP_ID = 'workspace_create';
export const WORKSPACE_LIST_APP_ID = 'workspace_list';
export const WORKSPACE_UPDATE_APP_ID = 'workspace_update';
export const WORKSPACE_OVERVIEW_APP_ID = 'workspace_overview';
// These features will be checked and disabled in checkbox on default.
export const DEFAULT_CHECKED_FEATURES_IDS = [WORKSPACE_UPDATE_APP_ID, WORKSPACE_OVERVIEW_APP_ID];
export const WORKSPACE_FATAL_ERROR_APP_ID = 'workspace_fatal_error';
export const PATHS = {
  create: '/create',
  overview: '/overview',
  update: '/update',
  list: '/list',
};
export const WORKSPACE_OP_TYPE_CREATE = 'create';
export const WORKSPACE_OP_TYPE_UPDATE = 'update';
export const WORKSPACE_SAVED_OBJECTS_CLIENT_WRAPPER_ID = 'workspace';

export enum PermissionModeId {
  Read = 'read',
  ReadAndWrite = 'read+write',
  Admin = 'admin',
}

export const OptionIdToWorkspacePermissionModesMap: {
  [key: string]: WorkspacePermissionMode[];
} = {
  [PermissionModeId.Read]: [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read],
  [PermissionModeId.ReadAndWrite]: [
    WorkspacePermissionMode.LibraryWrite,
    WorkspacePermissionMode.Read,
  ],
  [PermissionModeId.Admin]: [WorkspacePermissionMode.LibraryWrite, WorkspacePermissionMode.Write],
};
