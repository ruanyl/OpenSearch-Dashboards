/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import { WorkspacePermissionMode } from '../../../../../core/public';
import {
  UserOrGroupPermissionEditingData,
  WorkspaceFormEditingData,
  WorkspaceFormErrors,
  WorkspacePermissionSetting,
  WorkspacePermissionItemType,
  WorkspaceFormData,
} from './types';
import { OptionIdToWorkspacePermissionModesMap, PermissionModeId } from './constants';

export const isValidWorkspacePermissionSetting = (
  setting: Partial<WorkspacePermissionSetting>
): setting is WorkspacePermissionSetting =>
  !!setting.modes &&
  setting.modes.length > 0 &&
  ((setting.type === WorkspacePermissionItemType.User && !!setting.userId) ||
    (setting.type === WorkspacePermissionItemType.Group && !!setting.group));

export const getErrorsCount = (formErrors: WorkspaceFormErrors) => {
  let errorsCount = 0;
  if (formErrors.name) {
    errorsCount += 1;
  }
  if (formErrors.description) {
    errorsCount += 1;
  }
  if (formErrors.userPermissions) {
    errorsCount += formErrors.userPermissions.filter((permission) => !!permission).length;
  }
  if (formErrors.groupPermissions) {
    errorsCount += formErrors.groupPermissions.filter((permission) => !!permission).length;
  }
  return errorsCount;
};
export const getUserAndGroupPermissions = (
  permissions: Array<Partial<WorkspacePermissionSetting>>
) => {
  const userPermissions: UserOrGroupPermissionEditingData = [];
  const groupPermissions: UserOrGroupPermissionEditingData = [];
  for (const permission of permissions) {
    if (permission.type === WorkspacePermissionItemType.User) {
      userPermissions.push({ id: permission.userId, modes: permission.modes });
    }
    if (permission.type === WorkspacePermissionItemType.Group) {
      groupPermissions.push({ id: permission.group, modes: permission.modes });
    }
  }
  return [userPermissions, groupPermissions];
};

const getUnsavedUserOrGroupPermissionChangesCount = (
  initialPermissions: UserOrGroupPermissionEditingData,
  currentPermissions: UserOrGroupPermissionEditingData
) => {
  // for user or group permissions, unsaved changes is the sum of
  // # deleted permissions, # added permissions and # edited permissions
  let addedPermissions = 0;
  let editedPermissions = 0;
  const initialPermissionMap = new Map<string, WorkspacePermissionMode[]>();
  for (const permission of initialPermissions) {
    if (permission.id) {
      initialPermissionMap.set(permission.id, permission.modes ?? []);
    }
  }

  for (const permission of currentPermissions) {
    if (!permission.id) {
      addedPermissions += 1; // added permissions
    } else {
      const permissionModes = initialPermissionMap.get(permission.id);
      if (!permissionModes) {
        addedPermissions += 1;
      } else if (
        getPermissionModeId(permissionModes) !== getPermissionModeId(permission.modes ?? [])
      ) {
        editedPermissions += 1; // added or edited permissions
      }
    }
  }

  // currentPermissions.length = initialPermissions.length + # added permissions - # deleted permissions
  const deletedPermissions =
    addedPermissions + initialPermissions.length - currentPermissions.length;

  return addedPermissions + editedPermissions + deletedPermissions;
};

export const getUnsavedChangesCount = (
  initialFormData: WorkspaceFormData,
  currentFormData: WorkspaceFormEditingData
) => {
  let unsavedChangesCount = 0;
  if (initialFormData.name !== currentFormData.name) {
    unsavedChangesCount += 1;
  }
  // initial and current description could be undefined
  const initialDescription = initialFormData.description ?? '';
  const currentDescription = currentFormData.description ?? '';
  if (initialDescription !== currentDescription) {
    unsavedChangesCount += 1;
  }
  if (initialFormData.color !== currentFormData.color) {
    unsavedChangesCount += 1;
  }
  if (initialFormData.icon !== currentFormData.icon) {
    unsavedChangesCount += 1;
  }
  if (initialFormData.defaultVISTheme !== currentFormData.defaultVISTheme) {
    unsavedChangesCount += 1;
  }
  const featureIntersectionCount = (
    initialFormData.features?.filter((feature) => currentFormData.features?.includes(feature)) ?? []
  ).length;
  // for features, unsaved changes is the sum of # deleted features and # added features
  unsavedChangesCount += (initialFormData.features?.length ?? 0) - featureIntersectionCount;
  unsavedChangesCount += (currentFormData.features?.length ?? 0) - featureIntersectionCount;
  // for permissions, unsaved changes is the sum of # unsaved user permissions and # unsaved group permissions
  const [initialUserPermissions, initialGroupPermissions] = getUserAndGroupPermissions(
    initialFormData.permissions ?? []
  );
  unsavedChangesCount += getUnsavedUserOrGroupPermissionChangesCount(
    initialUserPermissions,
    currentFormData.userPermissions ?? []
  );
  unsavedChangesCount += getUnsavedUserOrGroupPermissionChangesCount(
    initialGroupPermissions,
    currentFormData.groupPermissions ?? []
  );
  return unsavedChangesCount;
};

// default permission mode is read
export const getPermissionModeId = (modes: WorkspacePermissionMode[]) => {
  for (const key in OptionIdToWorkspacePermissionModesMap) {
    if (OptionIdToWorkspacePermissionModesMap[key].every((mode) => modes?.includes(mode))) {
      return key;
    }
  }
  return PermissionModeId.Read;
};

export const getPermissionErrors = (permissions: Array<Partial<WorkspacePermissionSetting>>) => {
  const permissionErrors: string[] = new Array(permissions.length);
  for (let i = 0; i < permissions.length; i++) {
    const permission = permissions[i];
    if (isValidWorkspacePermissionSetting(permission)) {
      continue;
    }
    if (!permission.type) {
      permissionErrors[i] = i18n.translate('workspace.form.permission.invalidate.type', {
        defaultMessage: 'Invalid type',
      });
      continue;
    }
    if (!permission.modes || permission.modes.length === 0) {
      permissionErrors[i] = i18n.translate('workspace.form.permission.invalidate.modes', {
        defaultMessage: 'Invalid permission modes',
      });
      continue;
    }
    if (permission.type === WorkspacePermissionItemType.User && !permission.userId) {
      permissionErrors[i] = i18n.translate('workspace.form.permission.invalidate.userId', {
        defaultMessage: 'Invalid userId',
      });
      continue;
    }
    if (permission.type === WorkspacePermissionItemType.Group && !permission.group) {
      permissionErrors[i] = i18n.translate('workspace.form.permission.invalidate.group', {
        defaultMessage: 'Invalid user group',
      });
      continue; // this line is need for more conditions
    }
  }
  return permissionErrors;
};
