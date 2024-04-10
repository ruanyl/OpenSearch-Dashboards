/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkspacePermissionMode, DEFAULT_CHECKED_FEATURES_IDS } from '../../../common/constants';
import type { SavedObjectPermissions } from '../../../../../core/types';

import {
  WorkspaceFeature,
  WorkspaceFeatureGroup,
  WorkspacePermissionSetting,
  WorkspaceFormErrors,
} from './types';
import {
  WorkspacePermissionItemType,
  optionIdToWorkspacePermissionModesMap,
  PermissionModeId,
} from './constants';

export const isWorkspaceFeatureGroup = (
  featureOrGroup: WorkspaceFeature | WorkspaceFeatureGroup
): featureOrGroup is WorkspaceFeatureGroup => 'features' in featureOrGroup;

export const isValidWorkspacePermissionSetting = (
  setting: Partial<WorkspacePermissionSetting>
): setting is WorkspacePermissionSetting =>
  !!setting.modes &&
  setting.modes.length > 0 &&
  ((setting.type === WorkspacePermissionItemType.User && !!setting.userId) ||
    (setting.type === WorkspacePermissionItemType.Group && !!setting.group));

export const isDefaultCheckedFeatureId = (id: string) => {
  return DEFAULT_CHECKED_FEATURES_IDS.indexOf(id) > -1;
};

export const appendDefaultFeatureIds = (ids: string[]) => {
  // concat default checked ids and unique the result
  return Array.from(new Set(ids.concat(DEFAULT_CHECKED_FEATURES_IDS)));
};

export const isValidNameOrDescription = (input?: string) => {
  if (!input) {
    return true;
  }
  const regex = /^[0-9a-zA-Z()_\[\]\-\s]+$/;
  return regex.test(input);
};

export const getNumberOfErrors = (formErrors: WorkspaceFormErrors) => {
  let numberOfErrors = 0;
  if (formErrors.name) {
    numberOfErrors += 1;
  }
  if (formErrors.description) {
    numberOfErrors += 1;
  }
  if (formErrors.permissions) {
    numberOfErrors += formErrors.permissions.length;
  }
  return numberOfErrors;
};

export const isUserOrGroupPermissionSettingDuplicated = (
  permissionSettings: Array<Partial<WorkspacePermissionSetting>>,
  permissionSettingToCheck: WorkspacePermissionSetting
) =>
  permissionSettings.some(
    (permissionSetting) =>
      (permissionSettingToCheck.type === WorkspacePermissionItemType.User &&
        permissionSetting.type === WorkspacePermissionItemType.User &&
        permissionSettingToCheck.userId === permissionSetting.userId) ||
      (permissionSettingToCheck.type === WorkspacePermissionItemType.Group &&
        permissionSetting.type === WorkspacePermissionItemType.Group &&
        permissionSettingToCheck.group === permissionSetting.group)
  );

export const generateWorkspacePermissionItemKey = (
  item: Partial<WorkspacePermissionSetting>,
  index?: number
) =>
  [
    ...(item.type ?? []),
    ...(item.type === WorkspacePermissionItemType.User ? [item.userId] : []),
    ...(item.type === WorkspacePermissionItemType.Group ? [item.group] : []),
    ...(item.modes ?? []),
    index,
  ].join('-');

// default permission mode is read
export const getPermissionModeId = (modes: WorkspacePermissionMode[]) => {
  for (const key in optionIdToWorkspacePermissionModesMap) {
    if (optionIdToWorkspacePermissionModesMap[key].every((mode) => modes?.includes(mode))) {
      return key;
    }
  }
  return PermissionModeId.Read;
};

export const convertPermissionSettingsToPermissions = (
  permissionItems: WorkspacePermissionSetting[] | undefined
) => {
  if (!permissionItems || permissionItems.length === 0) {
    return undefined;
  }
  return permissionItems.reduce<SavedObjectPermissions>((previous, current) => {
    current.modes.forEach((mode) => {
      if (!previous[mode]) {
        previous[mode] = {};
      }
      switch (current.type) {
        case 'user':
          previous[mode].users = [...(previous[mode].users || []), current.userId];
          break;
        case 'group':
          previous[mode].groups = [...(previous[mode].groups || []), current.group];
          break;
      }
    });
    return previous;
  }, {});
};

const isWorkspacePermissionMode = (test: string): test is WorkspacePermissionMode =>
  test === WorkspacePermissionMode.LibraryRead ||
  test === WorkspacePermissionMode.LibraryWrite ||
  test === WorkspacePermissionMode.Read ||
  test === WorkspacePermissionMode.Write;

export const convertPermissionsToPermissionSettings = (permissions: SavedObjectPermissions) => {
  const userPermissionSettings: WorkspacePermissionSetting[] = [];
  const groupPermissionSettings: WorkspacePermissionSetting[] = [];
  const settingType2Modes: { [key: string]: WorkspacePermissionMode[] } = {};

  Object.keys(permissions).forEach((mode) => {
    if (!isWorkspacePermissionMode(mode)) {
      return;
    }
    permissions[mode].users?.forEach((userId) => {
      const settingTypeKey = `userId-${userId}`;
      const modes = settingType2Modes[settingTypeKey] ?? [];

      modes.push(mode);
      if (modes.length === 1) {
        userPermissionSettings.push({
          type: WorkspacePermissionItemType.User,
          userId,
          modes,
        });
        settingType2Modes[settingTypeKey] = modes;
      }
    });
    permissions[mode].groups?.forEach((group) => {
      const settingTypeKey = `group-${group}`;
      const modes = settingType2Modes[settingTypeKey] ?? [];

      modes.push(mode);
      if (modes.length === 1) {
        groupPermissionSettings.push({
          type: WorkspacePermissionItemType.Group,
          group,
          modes,
        });
        settingType2Modes[settingTypeKey] = modes;
      }
    });
  });

  return [...userPermissionSettings, ...groupPermissionSettings];
};
