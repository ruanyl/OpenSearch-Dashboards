/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkspacePermissionMode } from '../../../../../core/public';

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
