/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PERMISSION_TYPE_READ,
  Principals,
  Permissions,
  WorkspacePermissionCheck,
} from './workspace_permission_check';

describe('SavedObjectTypeRegistry', () => {
  let workspacePermissionCheck: WorkspacePermissionCheck;

  beforeEach(() => {
    workspacePermissionCheck = new WorkspacePermissionCheck();
  });

  it('test has permission', () => {
    const permissonType = PERMISSION_TYPE_READ;
    const principals: Principals = {
      users: ['user1'],
      groups: [],
    };
    const permissions: Permissions = {
      read: principals,
    };
    expect(workspacePermissionCheck.hasPermission(permissonType, permissions, 'user1')).toEqual(
      true
    );
    expect(workspacePermissionCheck.hasPermission(permissonType, permissions, 'user2')).toEqual(
      false
    );
  });

  it('test add permission', () => {
    const permissonType = PERMISSION_TYPE_READ;
    const principals: Principals = {
      users: ['user1'],
      groups: [],
    };
    const permissions: Permissions = {
      read: principals,
    };
    const result1 = workspacePermissionCheck.addPermission(permissonType, permissions, ['user1']);
    expect(result1.read?.users).toEqual(['user1']);

    const result2 = workspacePermissionCheck.addPermission(permissonType, permissions, ['user2']);
    expect(result2.read?.users).toEqual(['user1', 'user2']);
  });

  it('test remove permission', () => {
    const permissonType = PERMISSION_TYPE_READ;
    const principals: Principals = {
      users: ['user1'],
      groups: [],
    };
    const permissions: Permissions = {
      read: principals,
    };
    const result1 = workspacePermissionCheck.removePermission(permissonType, permissions, [
      'user1',
    ]);
    expect(result1.read?.users).toEqual([]);

    const result2 = workspacePermissionCheck.removePermission(permissonType, permissions, [
      'user2',
    ]);
    expect(result2.read?.users).toEqual(['user1']);
  });

  it('test genereate query DSL', () => {
    const permissonType = PERMISSION_TYPE_READ;

    const result = workspacePermissionCheck.genereateGetPermittedSavedObjectsQueryDSL(
      permissonType,
      'workspace',
      'user1'
    );
    expect(result).toEqual({
      query: {
        bool: {
          filter: [
            {
              term: {
                'permissions.read.users': 'user1',
              },
            },
            {
              terms: {
                type: ['workspace'],
              },
            },
          ],
        },
      },
    });
  });
});
