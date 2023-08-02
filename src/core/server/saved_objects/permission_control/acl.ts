/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PrincipalType } from '../../../../core/utils/constants';

export interface Principals {
  users?: string[];
  groups?: string[];
}

export type Permissions = Partial<Record<string, Principals>>;

const addPermissionToPrincipals = (
  principals?: Principals,
  users?: string[],
  groups?: string[]
) => {
  if (!principals) {
    principals = {};
  }
  if (!!users) {
    if (!principals.users) {
      principals.users = [];
    }
    principals.users = Array.from(new Set([...principals.users, ...users]));
  }
  if (!!groups) {
    if (!principals.groups) {
      principals.groups = [];
    }
    principals.groups = Array.from(new Set([...principals.groups, ...groups]));
  }
  return principals;
};

const deletePermissionFromPrincipals = (
  principals?: Principals,
  users?: string[],
  groups?: string[]
) => {
  if (!principals) {
    return principals;
  }
  if (!!users && !!principals.users) {
    principals.users = principals.users.filter((item) => !users.includes(item));
  }
  if (!!groups && !!principals.groups) {
    principals.groups = principals.groups.filter((item) => !groups.includes(item));
  }
  return principals;
};

export class ACL {
  private permissions?: Permissions;
  constructor(initialPermissions?: Permissions) {
    this.permissions = initialPermissions;
  }

  // parse the permissions object to check whether the specific user or group has the specific permission or not
  public hasPermission(
    permissionType: string,
    permissions: Permissions,
    user?: string,
    group?: string
  ) {
    if ((!user && !group) || !permissionType || !permissions) {
      return false;
    }

    const principals = permissions[permissionType];
    if (!!principals) {
      if (
        !!user &&
        !!principals.users &&
        (principals.users.includes('*') || principals.users.includes(user))
      ) {
        return true;
      }
      if (
        !!group &&
        !!principals.groups &&
        (principals.groups.includes('*') || principals.groups.includes(group))
      ) {
        return true;
      }
    }

    return false;
  }

  // permissions object build function, add users or groups with specific permission to the object
  public addPermission(permissionTypes: string[], users?: string[], groups?: string[]) {
    if ((!users && !groups) || !permissionTypes) {
      return this;
    }
    if (!this.permissions) {
      this.permissions = {};
    }

    for (const permissionType of permissionTypes) {
      this.permissions[permissionType] = addPermissionToPrincipals(
        this.permissions[permissionType],
        users,
        groups
      );
    }

    return this;
  }

  // permissions object build funciton, remove specific permission of specific users or groups from the object
  public removePermission(permissionTypes: string[], users?: string[], groups?: string[]) {
    if ((!users && !groups) || !permissionTypes) {
      return this;
    }
    if (!this.permissions) {
      this.permissions = {};
    }

    for (const permissionType of permissionTypes) {
      this.permissions[permissionType] = deletePermissionFromPrincipals(
        this.permissions[permissionType],
        users,
        groups
      );
    }

    return this;
  }

  // return the permissions object
  public getPermissions() {
    const permissions = this.permissions;
    // reset permissions
    this.permissions = {};

    return permissions;
  }

  /*
    generate query DSL by the specific conditions, used for fetching saved objects from the saved objects index
    */
  public genereateGetPermittedSavedObjectsQueryDSL(
    permissionType: string,
    savedObjectType?: string | string[],
    user?: string,
    group?: string
  ) {
    if ((!user && !group) || !permissionType) {
      return {
        query: {
          match_none: {},
        },
      };
    }

    const bool: any = {
      filter: [],
    };
    const subBool: any = {
      should: [],
    };
    if (!!user) {
      subBool.should.push({
        term: {
          ['permissions.' + permissionType + '.users']: user,
        },
      });
      subBool.should.push({
        term: {
          ['permissions.' + permissionType + '.users']: '*',
        },
      });
    }
    if (!!group) {
      subBool.should.push({
        term: {
          ['permissions.' + permissionType + '.groups']: group,
        },
      });
      subBool.should.push({
        term: {
          ['permissions.' + permissionType + '.groups']: '*',
        },
      });
    }

    bool.filter.push({
      bool: subBool,
    });

    if (!!savedObjectType) {
      bool.filter.push({
        terms: {
          type: Array.isArray(savedObjectType) ? savedObjectType : [savedObjectType],
        },
      });
    }

    return { query: { bool } };
  }

  /* 
    transfrom permissions format
    input:   {
        read: {
            users:['user1']
        },
        write:{
            groups:['group1']
        }
    }

    output: [
        {type:'user',name:'user1',permissions:['read']},
        {type:'group',name:'group1',permissions:['write']},
    ]
    */
  public transformPermissions(permissions: Permissions) {
    const result: any = [];
    if (!permissions) {
      return result;
    }
    const userPermissionMap: Map<string, string[]> = new Map();
    const groupPermissionMap: Map<string, string[]> = new Map();
    for (const permissionType in permissions) {
      if (!!permissionType) {
        const value = permissions[permissionType];
        if (value?.users) {
          for (const user of value?.users) {
            if (!userPermissionMap.get(user)) {
              userPermissionMap.set(user, []);
            }
            userPermissionMap.set(user, [...userPermissionMap.get(user)!, permissionType]);
          }
        }
        if (value?.groups) {
          for (const group of value?.groups) {
            if (!groupPermissionMap.get(group)) {
              groupPermissionMap.set(group, []);
            }
            groupPermissionMap.set(group, [...groupPermissionMap.get(group)!, permissionType]);
          }
        }
      }
    }

    for (const [user, userPermissions] of userPermissionMap) {
      result.push({
        type: PrincipalType.User,
        name: user,
        permissions: userPermissions,
      });
    }

    for (const [group, groupPermissions] of groupPermissionMap) {
      result.push({
        type: PrincipalType.Group,
        name: group,
        permissions: groupPermissions,
      });
    }

    return result;
  }
}
