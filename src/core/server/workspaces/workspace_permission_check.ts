/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { cloneDeep } from 'lodash';

export interface Permissions {
  write?: Principals;
  read?: Principals;
  management?: Principals;
  library_read?: Principals;
  library_write?: Principals;
}

export interface Principals {
  users?: string[];
  groups?: string[];
}

export const PERMISSION_TYPE_READ = 'read';
export const PERMISSION_TYPE_WRITE = 'write';
export const PERMISSION_TYPE_MANAGEMENT = 'management';
export const PERMISSION_TYPE_LIBRARY_READ = 'library_read';
export const PERMISSION_TYPE_LIBRARY_WRITE = 'library_write';

export const PERMISSION_TYPES: Set<string> = new Set([
  PERMISSION_TYPE_READ,
  PERMISSION_TYPE_WRITE,
  PERMISSION_TYPE_MANAGEMENT,
  PERMISSION_TYPE_LIBRARY_READ,
  PERMISSION_TYPE_LIBRARY_WRITE,
]);

const transferPermissionsToMap = (permissions: Permissions) => {
  const map: Map<string, Principals> = new Map();
  if (!!permissions.read) {
    map.set(PERMISSION_TYPE_READ, permissions.read);
  }
  if (!!permissions.write) {
    map.set(PERMISSION_TYPE_WRITE, permissions.write);
  }
  if (!!permissions.management) {
    map.set(PERMISSION_TYPE_MANAGEMENT, permissions.management);
  }
  if (!!permissions.library_read) {
    map.set(PERMISSION_TYPE_LIBRARY_READ, permissions.library_read);
  }
  if (!!permissions.library_write) {
    map.set(PERMISSION_TYPE_LIBRARY_WRITE, permissions.library_write);
  }
  return map;
};

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
      principals.users = [] as string[];
    }
    principals.users = principals.users.concat(
      users.filter((item) => !principals?.users?.includes(item))
    );
  }
  if (!!groups && !(principals.groups?.length === 1 && principals.groups[0] === '*')) {
    if (!principals.groups) {
      principals.groups = [] as string[];
    }
    principals.groups = principals.groups.concat(
      groups.filter((item) => !principals?.groups?.includes(item))
    );
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
  permissonType: string,
  user?: string | string[],
  group?: string | string[]
) => {
  if ((!user && !group) || !permissonType || !PERMISSION_TYPES.has(permissonType)) {
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
    const permissionMap = transferPermissionsToMap(permissions);
    const principals = permissionMap.get(permissonType);
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
    switch (permissonType) {
      case PERMISSION_TYPE_READ:
        newPermissions.read = addPermissionToPrincipals(newPermissions.read, users, groups);
        break;
      case PERMISSION_TYPE_WRITE:
        newPermissions.write = addPermissionToPrincipals(newPermissions.write, users, groups);
        break;
      case PERMISSION_TYPE_MANAGEMENT:
        newPermissions.management = addPermissionToPrincipals(
          newPermissions.management,
          users,
          groups
        );
        break;
      case PERMISSION_TYPE_LIBRARY_READ:
        newPermissions.library_read = addPermissionToPrincipals(
          newPermissions.library_read,
          users,
          groups
        );
        break;
      case PERMISSION_TYPE_LIBRARY_WRITE:
        newPermissions.library_write = addPermissionToPrincipals(
          newPermissions.library_write,
          users,
          groups
        );
        break;
    }
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
    switch (permissonType) {
      case PERMISSION_TYPE_READ:
        newPermissions.read = deletePermissionFromPrincipals(newPermissions.read, users, groups);
        break;
      case PERMISSION_TYPE_WRITE:
        newPermissions.write = deletePermissionFromPrincipals(newPermissions.write, users, groups);
        break;
      case PERMISSION_TYPE_MANAGEMENT:
        newPermissions.management = deletePermissionFromPrincipals(
          newPermissions.management,
          users,
          groups
        );
        break;
      case PERMISSION_TYPE_LIBRARY_READ:
        newPermissions.library_read = deletePermissionFromPrincipals(
          newPermissions.library_read,
          users,
          groups
        );
        break;
      case PERMISSION_TYPE_LIBRARY_WRITE:
        newPermissions.library_write = deletePermissionFromPrincipals(
          newPermissions.library_write,
          users,
          groups
        );
        break;
    }
    return newPermissions;
  }

  public genereateGetPermittedSavedObjectsQueryDSL(
    permissonType: string,
    savedObjectType?: string | string[],
    user?: string,
    group?: string
  ) {
    if ((!user && !group) || !permissonType || !PERMISSION_TYPES.has(permissonType)) {
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
      bool.filter.push({
        term: {
          ['permissions.' + permissonType + '.users']: user,
        },
      });
    } else if (!!group) {
      bool.filter.push({
        term: {
          ['permissions.' + permissonType + '.groups']: group,
        },
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
