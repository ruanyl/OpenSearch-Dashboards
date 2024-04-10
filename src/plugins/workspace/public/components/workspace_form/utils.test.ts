/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkspacePermissionMode } from '../../../common/constants';
import { WorkspacePermissionItemType } from './constants';
import {
  convertPermissionSettingsToPermissions,
  convertPermissionsToPermissionSettings,
} from './utils';

describe('convertPermissionSettingsToPermissions', () => {
  it('should return undefined if permission items not provided', () => {
    expect(convertPermissionSettingsToPermissions(undefined)).toBeUndefined();
    expect(convertPermissionSettingsToPermissions([])).toBeUndefined();
  });

  it('should return consistent permission settings', () => {
    expect(
      convertPermissionSettingsToPermissions([
        {
          type: WorkspacePermissionItemType.User,
          userId: 'foo',
          modes: [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read],
        },
        {
          type: WorkspacePermissionItemType.Group,
          group: 'bar',
          modes: [WorkspacePermissionMode.LibraryWrite],
        },
      ])
    ).toEqual({
      library_read: { users: ['foo'] },
      library_write: { groups: ['bar'] },
      read: { users: ['foo'] },
    });
  });
});

describe('convertPermissionsToPermissionSettings', () => {
  it('should return consistent permission settings', () => {
    expect(
      convertPermissionsToPermissionSettings({
        library_read: { users: ['foo'] },
        library_write: { groups: ['bar'] },
        read: { users: ['foo'] },
        write: { groups: ['bar'] },
      })
    ).toEqual([
      {
        type: WorkspacePermissionItemType.User,
        userId: 'foo',
        modes: [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read],
      },
      {
        type: WorkspacePermissionItemType.Group,
        group: 'bar',
        modes: [WorkspacePermissionMode.LibraryWrite, WorkspacePermissionMode.Write],
      },
    ]);
  });
  it('should only convert workspace supported permissions', () => {
    expect(
      convertPermissionsToPermissionSettings({
        another_read: { users: ['foo'] },
      })
    ).toEqual([]);
  });
});
