/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { App, WorkspacePermissionMode } from '../../../../../core/public';

export interface WorkspaceFeature extends Pick<App, 'dependencies'> {
  id: string;
  name: string;
}

export interface WorkspaceFeatureGroup {
  name: string;
  features: WorkspaceFeature[];
}
export interface WorkspaceFormSubmitData {
  name: string;
  description?: string;
  features?: string[];
  color?: string;
  icon?: string;
  defaultVISTheme?: string;
  permissions: WorkspacePermissionSetting[];
}

export interface WorkspaceFormData extends WorkspaceFormSubmitData {
  id: string;
  reserved?: boolean;
}

export type WorkspaceFormErrors = Omit<
  { [key in keyof WorkspaceFormData]?: string },
  'permissions'
> & {
  userPermissions?: string[];
  groupPermissions?: string[];
};

export enum WorkspacePermissionItemType {
  User = 'user',
  Group = 'group',
}

export interface TypelessPermissionSetting {
  id: string;
  modes: WorkspacePermissionMode[];
}

interface UserPermissionSetting {
  type: WorkspacePermissionItemType.User;
  userId: string;
  modes: WorkspacePermissionMode[];
}

interface GroupPermissionSetting {
  type: WorkspacePermissionItemType.Group;
  group: string;
  modes: WorkspacePermissionMode[];
}

export type WorkspacePermissionSetting = UserPermissionSetting | GroupPermissionSetting;

// when editing, attributes could be undefined in workspace form
export type WorkspaceFormEditingData = Partial<
  Omit<WorkspaceFormSubmitData, 'permissions'> & {
    userPermissions: Array<Partial<TypelessPermissionSetting>>;
    groupPermissions: Array<Partial<TypelessPermissionSetting>>;
  }
>;

export type PermissionEditingData = Array<Partial<TypelessPermissionSetting>>;
