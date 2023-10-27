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
import {
  WorkspacePermissionMode,
  PermissionModeId,
  OptionIdToWorkspacePermissionModesMap,
} from '../../../../../core/public';
import { WorkspacePermissionItemType, PermissionEditingData } from './types';
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

const generateWorkspacePermissionItemKey = (type: string, index: number) => [type, index].join('-');

interface WorkspacePermissionSettingInputProps {
  index: number;
  deletable: boolean;
  type: WorkspacePermissionItemType;
  permissionId?: string;
  permissionModes?: WorkspacePermissionMode[];
  onIdChange: (index: number, id?: string) => void;
  onPermissionModesChange: (
    WorkspacePermissionMode: WorkspacePermissionMode[],
    index: number
  ) => void;
  onDelete: (index: number) => void;
}

const WorkspacePermissionSettingInput = ({
  index,
  type,
  permissionModes,
  deletable,
  onDelete,
  onIdChange,
  permissionId,
  onPermissionModesChange,
}: WorkspacePermissionSettingInputProps) => {
  const idSelectedOptions = useMemo(
    () => (permissionId ? [{ label: permissionId as string }] : []),
    [permissionId]
  );

  const permissionModesSelectedId = useMemo(() => getPermissionModeId(permissionModes ?? []), [
    permissionModes,
  ]);

  const handleIdCreate = useCallback(
    (createdId) => {
      onIdChange(index, createdId);
    },
    [index, onIdChange]
  );

  const handleIdChange = useCallback(
    (options) => {
      if (options.length === 0) {
        onIdChange(index);
      }
    },
    [index, onIdChange]
  );

  const handlePermissionModeOptionChange = useCallback(
    (changedId: string) => {
      if (OptionIdToWorkspacePermissionModesMap[changedId]) {
        onPermissionModesChange([...OptionIdToWorkspacePermissionModesMap[changedId]], index);
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
          selectedOptions={idSelectedOptions}
          onCreateOption={handleIdCreate}
          onChange={handleIdChange}
          placeholder="Select"
          style={{ width: 200 }}
          data-test-subj={`workspaceForm-permissionSettingPanel-${type}-${index}-id`}
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
  userPermissionSettings: PermissionEditingData;
  groupPermissionSettings: PermissionEditingData;
  onUserPermissionChange: (value: PermissionEditingData) => void;
  onGroupPermissionChange: (value: PermissionEditingData) => void;
}

interface UserOrGroupSectionProps {
  title: string;
  errors?: string[];
  nonDeletableIndex: number;
  type: WorkspacePermissionItemType;
  permissionSettings: PermissionEditingData;
  onChange: (value: PermissionEditingData) => void;
}

const UserOrGroupSection = ({
  type,
  title,
  errors,
  onChange,
  permissionSettings,
  nonDeletableIndex,
}: UserOrGroupSectionProps) => {
  // default permission mode is read
  const handleAddNewOne = useCallback(() => {
    onChange?.([
      ...(permissionSettings ?? []),
      { modes: OptionIdToWorkspacePermissionModesMap[PermissionModeId.Read] },
    ]);
  }, [onChange, permissionSettings]);

  const handleDelete = useCallback(
    (index: number) => {
      onChange?.((permissionSettings ?? []).filter((_item, itemIndex) => itemIndex !== index));
    },
    [onChange, permissionSettings]
  );

  const handlePermissionModesChange = useCallback<
    WorkspacePermissionSettingInputProps['onPermissionModesChange']
  >(
    (modes, index) => {
      onChange?.(
        (permissionSettings ?? []).map((item, itemIndex) =>
          index === itemIndex ? { ...item, modes } : item
        )
      );
    },
    [onChange, permissionSettings]
  );

  const handleIdChange = useCallback<WorkspacePermissionSettingInputProps['onIdChange']>(
    (index: number, id?: string) => {
      onChange?.(
        (permissionSettings ?? []).map((item, itemIndex) =>
          index === itemIndex ? { id, ...(item.modes ? { modes: item.modes } : {}) } : item
        )
      );
    },
    [onChange, permissionSettings]
  );

  // assume that group items are always deletable
  return (
    <div>
      <EuiText>
        <strong>{title}</strong>
      </EuiText>
      <EuiSpacer size="s" />
      {permissionSettings?.map((permissionItem, index) => (
        <React.Fragment key={generateWorkspacePermissionItemKey(type, index)}>
          <EuiFormRow isInvalid={!!errors?.[index]} error={errors?.[index]}>
            <WorkspacePermissionSettingInput
              type={type}
              index={index}
              permissionId={permissionItem.id}
              permissionModes={permissionItem.modes}
              deletable={index !== nonDeletableIndex}
              onDelete={handleDelete}
              onIdChange={handleIdChange}
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
        userNonDeletableIndex = userPermissionSettings.findIndex(
          (permission) => getPermissionModeId(permission.modes ?? []) === PermissionModeId.Admin
        );
        groupNonDeletableIndex = groupPermissionSettings.findIndex(
          (permission) => getPermissionModeId(permission.modes ?? []) === PermissionModeId.Admin
        );
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
        onChange={onUserPermissionChange}
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
        onChange={onGroupPermissionChange}
        nonDeletableIndex={groupNonDeletableIndex}
        permissionSettings={groupPermissionSettings}
        type={WorkspacePermissionItemType.Group}
      />
    </div>
  );
};
