/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isValidWorkspacePermissionSetting,
  getErrorsCount,
  getUserAndGroupPermissions,
  getUnsavedChangesCount,
  getPermissionModeId,
  getPermissionErrors,
  formatPermissions,
} from './utils';
import {
  PermissionFieldData,
  WorkspaceFormErrors,
  WorkspacePermissionItemType,
  WorkspacePermissionSetting,
} from './types';
import { PublicAppInfo, WorkspacePermissionMode } from '../../../../../core/public';
import { PermissionModeId } from '../../../common/constants';

describe('isValidWorkspacePermissionSetting', () => {
  it('should return true with valid user permission setting', () => {
    expect(
      isValidWorkspacePermissionSetting({
        type: WorkspacePermissionItemType.User,
        userId: 'test user id',
        modes: [WorkspacePermissionMode.Write, WorkspacePermissionMode.LibraryWrite],
      })
    ).toBe(true);
  });

  it('should return true with valid group permission setting', () => {
    expect(
      isValidWorkspacePermissionSetting({
        type: WorkspacePermissionItemType.Group,
        group: 'test group id',
        modes: [WorkspacePermissionMode.Write, WorkspacePermissionMode.LibraryWrite],
      })
    ).toBe(true);
  });

  it('should return false with empty permission modes', () => {
    expect(
      isValidWorkspacePermissionSetting({
        type: WorkspacePermissionItemType.User,
        userId: 'test user id',
        modes: [],
      })
    ).toBe(false);
  });

  it('should return false with incorrect permission type (expect user)', () => {
    expect(
      isValidWorkspacePermissionSetting({
        type: WorkspacePermissionItemType.Group,
        userId: 'test user id',
        modes: [],
      } as any)
    ).toBe(false);
  });

  it('should return false with incorrect permission type 2 (expect group)', () => {
    expect(
      isValidWorkspacePermissionSetting({
        type: WorkspacePermissionItemType.User,
        group: 'test user id',
        modes: [],
      } as any)
    ).toBe(false);
  });
});

describe('getErrorsCount', () => {
  it('should return error count in name, description and permissions', () => {
    const workspaceFormErrors: WorkspaceFormErrors = {
      name: 'test name error',
      description: 'test description error',
      userPermissions: ['test user permission error 1'],
      groupPermissions: ['test group permission error 1', 'test group permission error 2'],
    };
    expect(getErrorsCount(workspaceFormErrors)).toBe(5);
  });
});

describe('getUserAndGroupPermissions', () => {
  it('should split user and group permissions from all permissions', () => {
    const permissions = [
      { type: WorkspacePermissionItemType.User, userId: 'test user id 1', modes: [] },
      { type: WorkspacePermissionItemType.Group, group: 'test group id 1', modes: [] },
      { type: WorkspacePermissionItemType.Group, group: 'test group id 2', modes: [] },
    ] as any;
    expect(getUserAndGroupPermissions(permissions)).toEqual(
      expect.arrayContaining([
        [{ id: 'test user id 1', modes: [] }],
        [
          { id: 'test group id 1', modes: [] },
          { id: 'test group id 2', modes: [] },
        ],
      ])
    );
  });
});

describe('getUnsavedChangesCount', () => {
  const allApplications = [
    { id: 'feature 1-1', category: { id: 'category 1' } },
    { id: 'feature 1-2', category: { id: 'category 1' } },
    { id: 'feature 2-1', category: { id: 'category 2' } },
    { id: 'feature 2-2', category: { id: 'category 2' } },
  ] as any;

  it('should return number of unsaved changes in workspace metadata', () => {
    const initialFormData = {
      id: 'test workspace id',
      name: 'test workspace name',
      description: 'test workspace description',
      permissions: [],
    };
    const currentFormData = {
      name: 'changed workspace name',
      description: 'changed workspace description',
    };
    expect(getUnsavedChangesCount(initialFormData, currentFormData, allApplications)).toBe(2);
  });

  it('should return number of unsaved changes in workspace features', () => {
    const initialFormData = {
      id: 'test workspace id',
      name: 'test workspace name',
      permissions: [],
      features: ['feature 1-1', 'feature 1-2', 'feature 2-1'],
    };
    const currentFormData = {
      name: 'test workspace name',
      features: ['feature 1-1', 'feature 1-2', 'feature 2-2'],
    };
    // 1 deleted feature and 1 added feature
    expect(getUnsavedChangesCount(initialFormData, currentFormData, allApplications)).toBe(2);
  });

  it('should return number of unsaved changes in workspace features with feature configs', () => {
    const initialFormData = {
      id: 'test workspace id',
      name: 'test workspace name',
      permissions: [],
      features: ['@category 1', '@category 2'],
    };
    const currentFormData = {
      name: 'test workspace name',
      features: ['@category 1', '!@category 2'],
    };
    // 1 deleted feature and 1 added feature
    expect(getUnsavedChangesCount(initialFormData, currentFormData, allApplications)).toBe(2);
  });

  it('should return number of unsaved changes in workspace permissions', () => {
    const initialFormData = {
      id: 'test workspace id',
      name: 'test workspace name',
      permissions: [
        {
          userId: 'test user id 1',
          type: WorkspacePermissionItemType.User,
          modes: [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read],
        },
        {
          group: 'test group id',
          type: WorkspacePermissionItemType.Group,
          modes: [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read],
        },
      ] as WorkspacePermissionSetting[],
    };
    const currentFormData = {
      name: 'test workspace name',
      userPermissions: [
        {
          id: 'test user id 1',
          modes: [WorkspacePermissionMode.LibraryWrite, WorkspacePermissionMode.Write],
        },
      ] as any,
      groupPermissions: [],
    };
    // 1 deleted permission and 1 edited permission
    expect(getUnsavedChangesCount(initialFormData, currentFormData, allApplications)).toBe(2);
  });
});

describe('getPermissionModeId', () => {
  it('should return Read with empty permission', () => {
    expect(getPermissionModeId([])).toBe(PermissionModeId.Read);
  });

  it('should return Read with [LibraryRead, Read]', () => {
    expect(
      getPermissionModeId([WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read])
    ).toBe(PermissionModeId.Read);
  });

  it('should return ReadAndWrite with [LibraryWrite, Read],', () => {
    expect(
      getPermissionModeId([WorkspacePermissionMode.LibraryWrite, WorkspacePermissionMode.Read])
    ).toBe(PermissionModeId.ReadAndWrite);
  });

  it('should return ReadAndWrite with [LibraryWrite, Read]', () => {
    expect(
      getPermissionModeId([WorkspacePermissionMode.LibraryWrite, WorkspacePermissionMode.Write])
    ).toBe(PermissionModeId.Admin);
  });
});

describe('getPermissionErrors', () => {
  it('should get permission errors for both users and groups', () => {
    const permissions = [
      {},
      { id: 'test permission id' },
      { id: 'test permission id', modes: [] },
      {
        id: 'test permission id',
        modes: [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read],
      },
    ];
    const expectedPermissionErrors = [
      'Invalid id',
      'Invalid permission modes',
      'Invalid permission modes',
    ];
    expect(getPermissionErrors(permissions)).toEqual(
      expect.arrayContaining(expectedPermissionErrors)
    );
  });
});

describe('formatPermissions', () => {
  it('should get permission errors for both users and groups', () => {
    const userPermissions: PermissionFieldData[] = [
      {
        id: 'read user',
        modes: [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read],
      },
      {
        id: 'admin user',
        modes: [WorkspacePermissionMode.LibraryWrite, WorkspacePermissionMode.Write],
      },
    ];
    const groupPermissions: PermissionFieldData[] = [
      {
        id: 'read group',
        modes: [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read],
      },
    ];
    const expectedPermissions: WorkspacePermissionSetting[] = [
      {
        userId: 'read user',
        type: WorkspacePermissionItemType.User,
        modes: [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read],
      },
      {
        userId: 'admin user',
        type: WorkspacePermissionItemType.User,
        modes: [WorkspacePermissionMode.LibraryWrite, WorkspacePermissionMode.Write],
      },
      {
        group: 'read group',
        type: WorkspacePermissionItemType.Group,
        modes: [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read],
      },
    ];
    expect(formatPermissions(userPermissions, groupPermissions)).toEqual(
      expect.arrayContaining(expectedPermissions)
    );
  });
});
