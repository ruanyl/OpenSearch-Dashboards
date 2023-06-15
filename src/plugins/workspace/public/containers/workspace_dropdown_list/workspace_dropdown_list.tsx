/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';

import { EuiButton, EuiComboBox, EuiComboBoxOptionOption } from '@elastic/eui';
import { useEffect } from 'react';
import useObservable from 'react-use/lib/useObservable';
import { CoreStart, WorkspaceAttribute } from '../../../../../core/public';

type WorkspaceOption = EuiComboBoxOptionOption<WorkspaceAttribute>;

interface WorkspaceDropdownListProps {
  coreStart: CoreStart;
  onCreateWorkspace: () => void;
  onSwitchWorkspace: (workspaceId: string) => void;
}

function workspaceToOption(workspace: WorkspaceAttribute): WorkspaceOption {
  return { label: workspace.name, key: workspace.id, value: workspace };
}

export function WorkspaceDropdownList(props: WorkspaceDropdownListProps) {
  const { coreStart, onCreateWorkspace, onSwitchWorkspace } = props;
  const [loading, setLoading] = useState(true);
  const [currentWorkspace, setCurrentWorkspace] = useState([] as WorkspaceOption[]);
  const [workspaceOptions, setWorkspaceOptions] = useState([] as WorkspaceOption[]);
  const workspaceList = useObservable(coreStart.workspaces.client.workspaceList$, []);
  const currentWorkspaceId = useObservable(coreStart.workspaces.client.currentWorkspaceId$, '');

  useEffect(() => {
    (async () => {
      if (!currentWorkspaceId) {
        setCurrentWorkspace([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const response = await coreStart.workspaces.client.get(currentWorkspaceId);
      if (response.success) {
        const currentWorkspaceOption = workspaceToOption(response.result);
        setCurrentWorkspace([currentWorkspaceOption]);
      } else {
        coreStart.notifications.toasts.addDanger({
          title: 'Failed to get current workspaces',
          text: response.error,
        });
        setCurrentWorkspace([]);
      }
      setLoading(false);
    })();
  }, [coreStart, currentWorkspaceId]);

  const onSearchChange = useCallback(
    (searchValue: string) => {
      const allWorkspaceOptions = workspaceList.map(workspaceToOption);
      setWorkspaceOptions(allWorkspaceOptions.filter((item) => item.label.includes(searchValue)));
    },
    [workspaceList]
  );

  const onChange = (workspaceOption: WorkspaceOption[]) => {
    /** switch the workspace */
    onSwitchWorkspace(workspaceOption[0].key!);
    setCurrentWorkspace(workspaceOption);
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
        selectedOptions={currentWorkspace}
        singleSelection={{ asPlainText: true }}
        onSearchChange={onSearchChange}
        append={<EuiButton onClick={onCreateWorkspace}>Create workspace</EuiButton>}
      />
    </>
  );
}
