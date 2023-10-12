/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiSuperSelect,
  EuiComboBox,
  EuiFlexItem,
  EuiButton,
  EuiButtonGroup,
  EuiFormRow,
  EuiText,
  EuiSpacer,
} from '@elastic/eui';
import { WorkspacePermissionMode } from '../../../../../core/public';

export type WorkspacePermissionSetting =
  | { type: 'user'; userId: string; modes: WorkspacePermissionMode[] }
  | { type: 'group'; group: string; modes: WorkspacePermissionMode[] };

enum PermissionModeId {
  Read = 'read',
  ReadAndWrite = 'read+write',
  Admin = 'admin',
}

const permissionModeOptions = [
  {
    id: PermissionModeId.Read,
    label: 'Read',
  },
  {
    id: PermissionModeId.ReadAndWrite,
    label: 'Read + Write',
  },
  {
    id: PermissionModeId.Admin,
    label: 'Admin',
  },
];

const optionIdToWorkspacePermissionModesMap: {
  [key: string]: WorkspacePermissionMode[];
} = {
  [PermissionModeId.Read]: [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.Read],
  [PermissionModeId.ReadAndWrite]: [
    WorkspacePermissionMode.LibraryWrite,
    WorkspacePermissionMode.Read,
  ],
  [PermissionModeId.Admin]: [WorkspacePermissionMode.LibraryWrite, WorkspacePermissionMode.Write],
};

const permissionTypeOptions = [
  { value: 'user' as const, inputDisplay: 'User' },
  { value: 'group' as const, inputDisplay: 'Group' },
];

const generateWorkspacePermissionItemKey = (
  item: Partial<WorkspacePermissionSetting>,
  index?: number
) =>
  [
    ...(item.type ?? []),
    ...(item.type === 'user' ? [item.userId] : []),
    ...(item.type === 'group' ? [item.group] : []),
    ...(item.modes ?? []),
    index,
  ].join('-');

interface WorkspacePermissionSettingInputProps {
  index: number;
  deletable: boolean;
  type?: 'user' | 'group';
  userId?: string;
  group?: string;
  modes?: WorkspacePermissionMode[];
  onTypeChange: (type: 'user' | 'group', index: number) => void;
  onGroupOrUserIdChange: (
    groupOrUserId:
      | { type: 'user'; userId: string }
      | { type: 'group'; group: string }
      | { type: 'user' | 'group' },
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
  deletable,
  type,
  userId,
  group,
  modes,
  onDelete,
  onTypeChange,
  onGroupOrUserIdChange,
  onPermissionModesChange,
}: WorkspacePermissionSettingInputProps) => {
  const groupOrUserIdSelectedOptions = useMemo(
    () => (group || userId ? [{ label: (group || userId) as string }] : []),
    [group, userId]
  );

  // default permission mode id admin
  const permissionModesSelectedId =
    useMemo(() => {
      for (const key in optionIdToWorkspacePermissionModesMap) {
        if (optionIdToWorkspacePermissionModesMap[key].every((mode) => modes?.includes(mode))) {
          return key;
        }
      }
    }, [modes]) ?? PermissionModeId.Admin;

  const handleTypeChange = useCallback(
    (newType: 'user' | 'group') => {
      onTypeChange(newType, index);
    },
    [onTypeChange, index]
  );

  const handleGroupOrUserIdCreate = useCallback(
    (groupOrUserId) => {
      if (!type) {
        return;
      }
      onGroupOrUserIdChange(
        type === 'group' ? { type, group: groupOrUserId } : { type, userId: groupOrUserId },
        index
      );
    },
    [index, type, onGroupOrUserIdChange]
  );

  const handleGroupOrUserIdChange = useCallback(
    (options) => {
      if (!type) {
        return;
      }
      if (options.length === 0) {
        onGroupOrUserIdChange({ type }, index);
      }
    },
    [index, type, onGroupOrUserIdChange]
  );

  const handlePermissionModeOptionChange = useCallback(
    (id: string) => {
      if (optionIdToWorkspacePermissionModesMap[id]) {
        onPermissionModesChange([...optionIdToWorkspacePermissionModesMap[id]], index);
      }
    },
    [index, onPermissionModesChange]
  );

  const handleDelete = useCallback(() => {
    onDelete(index);
  }, [index, onDelete]);

  return (
    <EuiFlexGroup alignItems="center" gutterSize="l">
      <EuiFlexItem grow>
        <EuiSuperSelect
          options={permissionTypeOptions}
          valueOfSelected={type}
          onChange={handleTypeChange}
          placeholder="User Type"
          style={{ width: 200 }}
          data-test-subj={`workspaceForm-permissionSettingPanel-${index}-userType`}
        />
      </EuiFlexItem>
      <EuiFlexItem grow>
        <EuiComboBox
          isDisabled={!type}
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
        <EuiButton
          color={'text'}
          onClick={handleDelete}
          isDisabled={!deletable}
          aria-label="Delete permission setting"
        >
          Remove
        </EuiButton>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

interface WorkspacePermissionSettingPanelProps {
  errors?: string[];
  value?: Array<Partial<WorkspacePermissionSetting>>;
  onChange?: (value: Array<Partial<WorkspacePermissionSetting>>) => void;
  firstRowDeletable?: boolean;
}

export const WorkspacePermissionSettingPanel = ({
  errors,
  value,
  onChange,
  firstRowDeletable,
}: WorkspacePermissionSettingPanelProps) => {
  const transformedValue = useMemo(() => {
    if (!value) {
      return [];
    }
    const result: Array<Partial<WorkspacePermissionSetting>> = [];
    /**
     * One workspace permission setting may include multi setting options,
     * for loop the workspace permission setting array to separate it to multi rows.
     **/
    for (let i = 0; i < value.length; i++) {
      const valueItem = value[i];
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
      for (const key in optionIdToWorkspacePermissionModesMap) {
        if (!Object.prototype.hasOwnProperty.call(optionIdToWorkspacePermissionModesMap, key)) {
          continue;
        }
        const modesForCertainPermissionId = optionIdToWorkspacePermissionModesMap[key];
        if (modesForCertainPermissionId.every((mode) => valueItem.modes?.includes(mode))) {
          result.push({ ...valueItem, modes: modesForCertainPermissionId });
        }
      }
    }
    return result;
  }, [value]);

  // default permission mode id admin
  const handleAddNewOne = useCallback(() => {
    onChange?.([
      ...(transformedValue ?? []),
      { modes: optionIdToWorkspacePermissionModesMap[PermissionModeId.Admin] },
    ]);
  }, [onChange, transformedValue]);

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

  const handleTypeChange = useCallback<WorkspacePermissionSettingInputProps['onTypeChange']>(
    (type, index) => {
      onChange?.(
        (transformedValue ?? []).map((item, itemIndex) =>
          index === itemIndex ? { ...item, type } : item
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

  return (
    <div>
      <EuiText>User / User Group / Role</EuiText>
      <EuiSpacer size={'s'} />
      {transformedValue?.map((item, index) => (
        <React.Fragment key={generateWorkspacePermissionItemKey(item, index)}>
          <EuiFormRow isInvalid={!!errors?.[index]} error={errors?.[index]}>
            <WorkspacePermissionSettingInput
              {...item}
              index={index}
              deletable={firstRowDeletable || index !== 0}
              onDelete={handleDelete}
              onTypeChange={handleTypeChange}
              onGroupOrUserIdChange={handleGroupOrUserIdChange}
              onPermissionModesChange={handlePermissionModesChange}
            />
          </EuiFormRow>
        </React.Fragment>
      ))}
      <EuiButton
        fill
        onClick={handleAddNewOne}
        fullWidth={false}
        color={'text'}
        data-test-subj="workspaceForm-permissionSettingPanel-addNew"
      >
        Add New
      </EuiButton>
    </div>
  );
};
