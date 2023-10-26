/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiComboBox,
  EuiFlexItem,
  EuiButton,
  EuiButtonIcon,
  EuiButtonGroup,
  EuiFormRow,
  EuiText,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { WorkspacePermissionMode } from '../../../../../core/public';
import {
  UserPermissionSetting,
  GroupPermissionSetting,
  WorkspacePermissionSetting,
  WorkspacePermissionItemType,
} from './types';
import { PermissionModeId, OptionIdToWorkspacePermissionModesMap } from './constants';
import { getPermissionModeId } from './utils';

const permissionModeOptions = [
  {
    id: PermissionModeId.Read,
    label: i18n.translate('workspace.form.permissionSettingPanel.permissionModeOptions.read', {
      defaultMessage: 'Read',
    }),
  },
  {
    id: PermissionModeId.ReadAndWrite,
    label: i18n.translate(
      'workspace.form.permissionSettingPanel.permissionModeOptions.readAndWrite',
      {
        defaultMessage: 'Read & Write',
      }
    ),
  },
  {
    id: PermissionModeId.Admin,
    label: i18n.translate('workspace.form.permissionSettingPanel.permissionModeOptions.admin', {
      defaultMessage: 'Admin',
    }),
  },
];

const generateWorkspacePermissionItemKey = (
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

interface WorkspacePermissionSettingInputProps {
  index: number;
  deletable: boolean;
  type: WorkspacePermissionItemType;
  userId?: string;
  group?: string;
  modes?: WorkspacePermissionMode[];
  onGroupOrUserIdChange: (
    groupOrUserId:
      | { type: WorkspacePermissionItemType.User; userId?: string }
      | { type: WorkspacePermissionItemType.Group; group?: string },
    index: number
  ) => void;
  onPermissionModesChange: (
    WorkspacePermissionMode: WorkspacePermissionMode[],
    index: number
  ) => void;
  onDelete: (index: number) => void;
}

const WorkspacePermissionSettingInput = ({
  index,
  type,
  userId,
  group,
  modes,
  deletable,
  onDelete,
  onGroupOrUserIdChange,
  onPermissionModesChange,
}: WorkspacePermissionSettingInputProps) => {
  const groupOrUserIdSelectedOptions = useMemo(
    () => (group || userId ? [{ label: (group || userId) as string }] : []),
    [group, userId]
  );

  const permissionModesSelectedId = useMemo(() => getPermissionModeId(modes ?? []), [modes]);
  const handleGroupOrUserIdCreate = useCallback(
    (groupOrUserId) => {
      onGroupOrUserIdChange(
        type === WorkspacePermissionItemType.Group
          ? { type, group: groupOrUserId }
          : { type, userId: groupOrUserId },
        index
      );
    },
    [index, type, onGroupOrUserIdChange]
  );

  const handleGroupOrUserIdChange = useCallback(
    (options) => {
      if (options.length === 0) {
        onGroupOrUserIdChange({ type }, index);
      }
    },
    [index, type, onGroupOrUserIdChange]
  );

  const handlePermissionModeOptionChange = useCallback(
    (id: string) => {
      if (OptionIdToWorkspacePermissionModesMap[id]) {
        onPermissionModesChange([...OptionIdToWorkspacePermissionModesMap[id]], index);
      }
    },
    [index, onPermissionModesChange]
  );

  const handleDelete = useCallback(() => {
    onDelete(index);
  }, [index, onDelete]);

  return (
    <EuiFlexGroup alignItems="center" gutterSize="l">
      <EuiFlexItem>
        <EuiComboBox
          singleSelection
          selectedOptions={groupOrUserIdSelectedOptions}
          onCreateOption={handleGroupOrUserIdCreate}
          onChange={handleGroupOrUserIdChange}
          placeholder="Select"
          style={{ width: 200 }}
          data-test-subj={`workspaceForm-permissionSettingPanel-${index}-userId`}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButtonGroup
          type="single"
          isDisabled={!deletable}
          legend="Permission Modes"
          options={permissionModeOptions}
          idSelected={permissionModesSelectedId}
          onChange={handlePermissionModeOptionChange}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButtonIcon
          color="danger"
          aria-label="Delete permission setting"
          iconType="trash"
          display="base"
          size="m"
          onClick={handleDelete}
          isDisabled={!deletable}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

interface WorkspacePermissionSettingPanelProps {
  userErrors?: string[];
  groupErrors?: string[];
  lastAdminItemDeletable?: boolean;
  userPermissionSettings: Array<Partial<UserPermissionSetting>>;
  groupPermissionSettings: Array<Partial<GroupPermissionSetting>>;
  onUserPermissionChange: (value: Array<Partial<UserPermissionSetting>>) => void;
  onGroupPermissionChange: (value: Array<Partial<GroupPermissionSetting>>) => void;
}

interface UserOrGroupSectionProps {
  title: string;
  errors?: string[];
  nonDeletableIndex: number;
  type: WorkspacePermissionItemType;
  permissionSettings: Array<Partial<WorkspacePermissionSetting>>;
  onChange: (value: Array<Partial<WorkspacePermissionSetting>>) => void;
}

const UserOrGroupSection = ({
  type,
  title,
  errors,
  onChange,
  permissionSettings,
  nonDeletableIndex,
}: UserOrGroupSectionProps) => {
  const transformedValue = useMemo(() => {
    if (!permissionSettings) {
      return [];
    }
    const result: Array<Partial<WorkspacePermissionSetting>> = [];
    /**
     * One workspace permission setting may include multi setting options,
     * for loop the workspace permission setting array to separate it to multi rows.
     **/
    for (let i = 0; i < permissionSettings.length; i++) {
      const valueItem = permissionSettings[i];
      // Incomplete workspace permission setting don't need to separate to multi rows
      if (
        !valueItem.modes ||
        !valueItem.type ||
        (valueItem.type === 'user' && !valueItem.userId) ||
        (valueItem.type === 'group' && !valueItem.group)
      ) {
        result.push(valueItem);
        continue;
      }
      /**
       * For loop the option id to workspace permission modes map,
       * if one settings includes all permission modes in a specific option,
       * add these permission modes to the result array.
       */
      for (const key in OptionIdToWorkspacePermissionModesMap) {
        if (!Object.prototype.hasOwnProperty.call(OptionIdToWorkspacePermissionModesMap, key)) {
          continue;
        }
        const modesForCertainPermissionId = OptionIdToWorkspacePermissionModesMap[key];
        if (modesForCertainPermissionId.every((mode) => valueItem.modes?.includes(mode))) {
          result.push({ ...valueItem, modes: modesForCertainPermissionId });
        }
      }
    }
    return result;
  }, [permissionSettings]);

  // default permission mode is read
  const handleAddNewOne = useCallback(() => {
    onChange?.([
      ...(transformedValue ?? []),
      { type, modes: OptionIdToWorkspacePermissionModesMap[PermissionModeId.Read] },
    ]);
  }, [onChange, type, transformedValue]);

  const handleDelete = useCallback(
    (index: number) => {
      onChange?.((transformedValue ?? []).filter((_item, itemIndex) => itemIndex !== index));
    },
    [onChange, transformedValue]
  );

  const handlePermissionModesChange = useCallback<
    WorkspacePermissionSettingInputProps['onPermissionModesChange']
  >(
    (modes, index) => {
      onChange?.(
        (transformedValue ?? []).map((item, itemIndex) =>
          index === itemIndex ? { ...item, modes } : item
        )
      );
    },
    [onChange, transformedValue]
  );

  const handleGroupOrUserIdChange = useCallback<
    WorkspacePermissionSettingInputProps['onGroupOrUserIdChange']
  >(
    (userOrGroupIdWithType, index) => {
      onChange?.(
        (transformedValue ?? []).map((item, itemIndex) =>
          index === itemIndex
            ? { ...userOrGroupIdWithType, ...(item.modes ? { modes: item.modes } : {}) }
            : item
        )
      );
    },
    [onChange, transformedValue]
  );

  // assume that group items are always deletable
  return (
    <div>
      <EuiText>
        <strong>{title}</strong>
      </EuiText>
      <EuiSpacer size="s" />
      {transformedValue?.map((item, index) => (
        <React.Fragment key={generateWorkspacePermissionItemKey(item, index)}>
          <EuiFormRow isInvalid={!!errors?.[index]} error={errors?.[index]}>
            <WorkspacePermissionSettingInput
              {...item}
              type={type}
              index={index}
              deletable={index !== nonDeletableIndex}
              onDelete={handleDelete}
              onGroupOrUserIdChange={handleGroupOrUserIdChange}
              onPermissionModesChange={handlePermissionModesChange}
            />
          </EuiFormRow>
        </React.Fragment>
      ))}
      <EuiButton
        fill
        fullWidth={false}
        onClick={handleAddNewOne}
        data-test-subj={`workspaceForm-permissionSettingPanel-${type}-addNew`}
      >
        {i18n.translate('workspace.form.permissionSettingPanel.addNew', {
          defaultMessage: 'Add New',
        })}
      </EuiButton>
    </div>
  );
};

export const WorkspacePermissionSettingPanel = ({
  userErrors,
  groupErrors,
  onUserPermissionChange,
  onGroupPermissionChange,
  userPermissionSettings,
  groupPermissionSettings,
  lastAdminItemDeletable,
}: WorkspacePermissionSettingPanelProps) => {

  const nonDeletableIndex = useMemo(() => {
    let userNonDeletableIndex = -1;
    let groupNonDeletableIndex = -1;
    const newPermissionSettings = [...userPermissionSettings, ...groupPermissionSettings];
    if (!lastAdminItemDeletable) {
      const adminPermissionSettings = newPermissionSettings.filter(
        (permission) => getPermissionModeId(permission.modes ?? []) === PermissionModeId.Admin
      );
      if (adminPermissionSettings.length === 1) {
        if (adminPermissionSettings[0].type === WorkspacePermissionItemType.User) {
          userNonDeletableIndex = userPermissionSettings.findIndex(
            (permission) => getPermissionModeId(permission.modes ?? []) === PermissionModeId.Admin
          );
        } else {
          groupNonDeletableIndex = groupPermissionSettings.findIndex(
            (permission) => getPermissionModeId(permission.modes ?? []) === PermissionModeId.Admin
          );
        }
      }
    }
    return { userNonDeletableIndex, groupNonDeletableIndex };
  }, [userPermissionSettings, groupPermissionSettings, lastAdminItemDeletable]);

  const { userNonDeletableIndex, groupNonDeletableIndex } = nonDeletableIndex;

  return (
    <div>
      <UserOrGroupSection
        title={i18n.translate('workspace.form.permissionSettingPanel.userTitle', {
          defaultMessage: 'User',
        })}
        errors={userErrors}
        onChange={onUserPermissionChange as any}
        nonDeletableIndex={userNonDeletableIndex}
        permissionSettings={userPermissionSettings}
        type={WorkspacePermissionItemType.User}
      />
      <EuiSpacer size="s" />
      <UserOrGroupSection
        title={i18n.translate('workspace.form.permissionSettingPanel.userGroupTitle', {
          defaultMessage: 'User Groups',
        })}
        errors={groupErrors}
        onChange={onGroupPermissionChange as any}
        nonDeletableIndex={groupNonDeletableIndex}
        permissionSettings={groupPermissionSettings}
        type={WorkspacePermissionItemType.Group}
      />
    </div>
  );
};
