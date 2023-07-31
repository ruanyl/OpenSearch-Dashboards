/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PERMISSION_TYPE,
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
    const permissionType = PERMISSION_TYPE.READ;
    const principals: Principals = {
      users: ['user1'],
      groups: [],
    };
    const permissions: Permissions = {
      read: principals,
    };
    expect(workspacePermissionCheck.hasPermission(permissionType, permissions, 'user1')).toEqual(
      true
    );
    expect(workspacePermissionCheck.hasPermission(permissionType, permissions, 'user2')).toEqual(
      false
    );
  });

  it('test add permission', () => {
    const permissionType = PERMISSION_TYPE.READ;
    const principals: Principals = {
      users: ['user1'],
      groups: [],
    };
    const permissions: Permissions = {
      read: principals,
    };
    const result1 = workspacePermissionCheck.addPermission(permissionType, permissions, ['user1']);
    expect(result1.read?.users).toEqual(['user1']);

    const result2 = workspacePermissionCheck.addPermission(permissionType, permissions, ['user2']);
    expect(result2.read?.users).toEqual(['user1', 'user2']);
  });

  it('test remove permission', () => {
    const permissionType = PERMISSION_TYPE.READ;
    const principals: Principals = {
      users: ['user1'],
      groups: [],
    };
    const permissions: Permissions = {
      read: principals,
    };
    const result1 = workspacePermissionCheck.removePermission(permissionType, permissions, [
      'user1',
    ]);
    expect(result1.read?.users).toEqual([]);

    const result2 = workspacePermissionCheck.removePermission(permissionType, permissions, [
      'user2',
    ]);
    expect(result2.read?.users).toEqual(['user1']);
  });

  it('test genereate query DSL', () => {
    const permissionType = PERMISSION_TYPE.READ;

    const result = workspacePermissionCheck.genereateGetPermittedSavedObjectsQueryDSL(
      permissionType,
      'workspace',
      'user1'
    );
    expect(result).toEqual({
      query: {
        bool: {
          filter: [
            {
              bool: {
                should: [
                  {
                    term: {
                      'permissions.read.users': 'user1',
                    },
                  },
                  {
                    term: {
                      'permissions.read.users': '*',
                    },
                  },
                ],
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
