/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';

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
  // const [workspaceOptions, setWorkspaceOptions] = useState([] as WorkspaceOption[]);
  const workspaceList = useObservable(coreStart.workspaces.client.workspaceList$, []);
  // const currentWorkspaceId = useObservable(coreStart.workspaces.client.currentWorkspaceId$);

  const workspaceOptions = workspaceList.map(workspaceToOption);

  useEffect(() => {
    (async () => {
      const response = await coreStart.workspaces.client.getCurrentWorkspace();
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
  }, [coreStart]);

  const onChange = (workspaceOption: WorkspaceOption[]) => {
    /** switch the workspace */
    // console.log(JSON.stringify(workspaceOption),JSON.stringify(currentWorkspace));
    onSwitchWorkspace(workspaceOption[0].key!);
    setCurrentWorkspace(workspaceOption);
  };

  return (
    <>
      <EuiComboBox
        async
        options={workspaceOptions}
        isLoading={loading}
        onChange={onChange}
        selectedOptions={currentWorkspace}
        singleSelection={{ asPlainText: true }}
        append={<EuiButton onClick={onCreateWorkspace}>Create workspace</EuiButton>}
      />
    </>
  );
}
