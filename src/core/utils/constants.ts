/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const WORKSPACE_PATH_PREFIX = '/w';

export enum WorkspacePermissionMode {
  Read = 'read',
  Write = 'write',
  Management = 'management',
  LibraryRead = 'library_read',
  LibraryWrite = 'library_write',
}

export const PUBLIC_WORKSPACE = 'public';

export const MANAGEMENT_WORKSPACE = 'management';

export const WORKSPACE_FEATURE_FLAG_KEY_IN_UI_SETTINGS = 'workspace:enabled';
