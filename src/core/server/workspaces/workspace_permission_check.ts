/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { cloneDeep } from 'lodash';

export enum PERMISSION_TYPE {
  READ = 'read',
  WRITE = 'write',
  MANAGEMENT = 'management',
  LIBRARY_READ = 'library_read',
  LIBRARY_WRITE = 'library_write',
}

export interface Principals {
  users?: string[];
  groups?: string[];
}

export type Permissions = Partial<Record<PERMISSION_TYPE, Principals>>;

const PERMISSION_TYPE_MAP = new Map<string, PERMISSION_TYPE>([
  ['read', PERMISSION_TYPE.READ],
  ['write', PERMISSION_TYPE.WRITE],
  ['management', PERMISSION_TYPE.MANAGEMENT],
  ['library_read', PERMISSION_TYPE.LIBRARY_READ],
  ['library_write', PERMISSION_TYPE.LIBRARY_WRITE],
]);

const addPermissionToPrincipals = (
  principals?: Principals,
  users?: string[],
  groups?: string[]
) => {
  if (!principals) {
    principals = {};
  }
  if (!!users && !(principals.users?.length === 1 && principals.users[0] === '*')) {
    if (!principals.users) {
      principals.users = [];
    }
    principals.users = Array.from(new Set([...principals.users, ...users]));
  }
  if (!!groups && !(principals.groups?.length === 1 && principals.groups[0] === '*')) {
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

const isParamsValid = (
  permissionType: string,
  user?: string | string[],
  group?: string | string[]
) => {
  if ((!user && !group) || !permissionType || !PERMISSION_TYPE_MAP.get(permissionType)) {
    return false;
  }
  return true;
};

export class WorkspacePermissionCheck {
  public hasPermission(
    permissonType: string,
    permissions: Permissions,
    user?: string,
    group?: string
  ) {
    if (!isParamsValid(permissonType, user, group) || !permissions) {
      return false;
    }

    const principals =
      permissions[(PERMISSION_TYPE_MAP.get(permissonType) as unknown) as PERMISSION_TYPE];
    if (!!principals) {
      if (
        !!user &&
        !!principals.users &&
        ((principals.users.length === 1 && principals.users[0] === '*') ||
          principals.users.includes(user))
      ) {
        return true;
      }
      if (
        !!group &&
        !!principals.groups &&
        ((principals.groups.length === 1 && principals.groups[0] === '*') ||
          principals.groups.includes(group))
      ) {
        return true;
      }
    }

    return false;
  }

  public addPermission(
    permissonType: string,
    permissions: Permissions,
    users?: string[],
    groups?: string[]
  ) {
    if (!isParamsValid(permissonType, users, groups)) {
      return permissions;
    }
    let newPermissions = cloneDeep(permissions);
    if (!newPermissions) {
      newPermissions = {};
    }

    let newPrincipals =
      newPermissions[(PERMISSION_TYPE_MAP.get(permissonType) as unknown) as PERMISSION_TYPE];
    newPrincipals = addPermissionToPrincipals(newPrincipals, users, groups);

    return newPermissions;
  }

  public removePermission(
    permissonType: string,
    permissions: Permissions,
    users?: string[],
    groups?: string[]
  ) {
    if (!isParamsValid(permissonType, users, groups) || !permissions) {
      return permissions;
    }

    const newPermissions = cloneDeep(permissions);

    let newPrincipals =
      newPermissions[(PERMISSION_TYPE_MAP.get(permissonType) as unknown) as PERMISSION_TYPE];
    newPrincipals = deletePermissionFromPrincipals(newPrincipals, users, groups);

    return newPermissions;
  }

  public genereateGetPermittedSavedObjectsQueryDSL(
    permissonType: string,
    savedObjectType?: string | string[],
    user?: string,
    group?: string
  ) {
    if (!isParamsValid(permissonType, user, group)) {
      return {
        query: {
          match_none: {},
        },
      };
    }

    const bool: any = {
      filter: [],
    };
    if (!!user) {
      const subBool: any = {
        should: [],
      };
      subBool.should.push({
        term: {
          ['permissions.' + permissonType + '.users']: user,
        },
      });
      subBool.should.push({
        term: {
          ['permissions.' + permissonType + '.users']: '*',
        },
      });
      bool.filter.push({
        bool: subBool,
      });
    } else if (!!group) {
      const subBool: any = {
        should: [],
      };
      subBool.should.push({
        term: {
          ['permissions.' + permissonType + '.groups']: group,
        },
      });
      subBool.should.push({
        term: {
          ['permissions.' + permissonType + '.groups']: '*',
        },
      });
      bool.filter.push({
        bool: subBool,
      });
    }

    if (!!savedObjectType) {
      bool.filter.push({
        terms: {
          type: Array.isArray(savedObjectType) ? savedObjectType : [savedObjectType],
        },
      });
    }

    return { query: { bool } };
  }
}
