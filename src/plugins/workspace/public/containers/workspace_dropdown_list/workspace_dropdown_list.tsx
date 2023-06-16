/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';

import { EuiButton, EuiComboBox, EuiComboBoxOptionOption } from '@elastic/eui';
import useObservable from 'react-use/lib/useObservable';
import { i18n } from '@osd/i18n';
import { CoreStart, WorkspaceAttribute } from '../../../../../core/public';

type WorkspaceOption = EuiComboBoxOptionOption<WorkspaceAttribute>;

interface WorkspaceDropdownListProps {
  coreStart: CoreStart;
  onCreateWorkspace: () => void;
  onSwitchWorkspace: (workspaceId: string) => Promise<void>;
}

function workspaceToOption(workspace: WorkspaceAttribute | null): WorkspaceOption {
  if (workspace) {
    return { label: workspace.name, key: workspace.id, value: workspace };
  } else {
    return { label: '', key: '' };
  }
}

export function getErrorMessage(err: any) {
  if (err && err.message) return err.message;
  return '';
}

export function WorkspaceDropdownList(props: WorkspaceDropdownListProps) {
  const { coreStart, onCreateWorkspace, onSwitchWorkspace } = props;
  const workspaceList = useObservable(coreStart.workspaces.client.workspaceList$, []);
  const currentWorkspace = useObservable(coreStart.workspaces.client.currentWorkspace$, null);

  const [loading, setLoading] = useState(false);
  const [workspaceOptions, setWorkspaceOptions] = useState([] as WorkspaceOption[]);

  const currentWorkspaceOption = useMemo(() => {
    return [workspaceToOption(currentWorkspace)];
  }, [currentWorkspace]);
  const allWorkspaceOptions = useMemo(() => {
    return workspaceList.map(workspaceToOption);
  }, [workspaceList]);

  const onSearchChange = useCallback(
    (searchValue: string) => {
      setWorkspaceOptions(allWorkspaceOptions.filter((item) => item.label.includes(searchValue)));
    },
    [allWorkspaceOptions]
  );

  const onChange = (workspaceOption: WorkspaceOption[]) => {
    /** switch the workspace */
    setLoading(true);
    onSwitchWorkspace(workspaceOption[0].key!)
      .catch((err) =>
        coreStart.notifications.toasts.addDanger({
          title: i18n.translate('workspace.dropdownList.switchWorkspaceErrorTitle', {
            defaultMessage: 'some error happens when switching workspace',
          }),
          text: getErrorMessage(err),
        })
      )
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    onSearchChange('');
  }, [onSearchChange]);

  return (
    <>
      <EuiComboBox
        async
        options={workspaceOptions}
        isLoading={loading}
        onChange={onChange}
        selectedOptions={currentWorkspaceOption}
        singleSelection={{ asPlainText: true }}
        onSearchChange={onSearchChange}
        append={<EuiButton onClick={onCreateWorkspace}>Create workspace</EuiButton>}
      />
    </>
  );
}
