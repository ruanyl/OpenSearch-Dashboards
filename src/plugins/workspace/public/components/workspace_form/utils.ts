/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkspacePermissionMode, DEFAULT_SELECTED_FEATURES_IDS } from '../../../common/constants';

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
import {
  AppNavLinkStatus,
  DEFAULT_APP_CATEGORIES,
  PublicAppInfo,
} from '../../../../../core/public';

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
  return DEFAULT_SELECTED_FEATURES_IDS.indexOf(id) > -1;
};

export const appendDefaultFeatureIds = (ids: string[]) => {
  // concat default checked ids and unique the result
  return Array.from(new Set(ids.concat(DEFAULT_SELECTED_FEATURES_IDS)));
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

export const convertApplicationsToFeaturesOrGroups = (
  applications: Array<
    Pick<PublicAppInfo, 'id' | 'title' | 'category' | 'navLinkStatus' | 'chromeless'>
  >
) => {
  const UNDEFINED = 'undefined';

  // Filter out all hidden applications and management applications and default selected features
  const visibleApplications = applications.filter(
    ({ navLinkStatus, chromeless, category, id }) =>
      navLinkStatus !== AppNavLinkStatus.hidden &&
      !chromeless &&
      !DEFAULT_SELECTED_FEATURES_IDS.includes(id) &&
      category?.id !== DEFAULT_APP_CATEGORIES.management.id
  );

  /**
   *
   * Convert applications to features map, the map use category label as
   * map key and group all same category applications in one array after
   * transfer application to feature.
   *
   **/
  const categoryLabel2Features = visibleApplications.reduce<{
    [key: string]: WorkspaceFeature[];
  }>((previousValue, application) => {
    const label = application.category?.label || UNDEFINED;

    return {
      ...previousValue,
      [label]: [...(previousValue[label] || []), { id: application.id, name: application.title }],
    };
  }, {});

  /**
   *
   * Iterate all keys of categoryLabel2Features map, convert map to features or groups array.
   * Features with category label will be converted to feature groups. Features without "undefined"
   * category label will be converted to single features. Then append them to the result array.
   *
   **/
  return Object.keys(categoryLabel2Features).reduce<
    Array<WorkspaceFeature | WorkspaceFeatureGroup>
  >((previousValue, categoryLabel) => {
    const features = categoryLabel2Features[categoryLabel];
    if (categoryLabel === UNDEFINED) {
      return [...previousValue, ...features];
    }
    return [
      ...previousValue,
      {
        name: categoryLabel,
        features,
      },
    ];
  }, []);
};
