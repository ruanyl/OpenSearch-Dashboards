/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';

import { EuiButton, EuiComboBox, EuiComboBoxOptionOption } from '@elastic/eui';
import { useEffect } from 'react';
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

  // use front-end filter for now, waiting for a new solution
  // const onSearchChange = useCallback(
  //   async (searchValue: string) => {
  //     setLoading(true);
  //     const response = await coreStart.workspaces.client.list({
  //       // sort_field: 'name',
  //       search: `${searchValue.trim()}*`,
  //       perPage: 999,
  //       searchFields: ['name'],
  //     });
  //     console.log(JSON.stringify(response), `${searchValue.trim()}*`);
  //     if (response.success) {
  //       const searchedWorkspaceOptions = response.result.workspaces.map(workspaceToOption);
  //       setWorkspaceOptions(searchedWorkspaceOptions);
  //     } else {
  //       coreStart.notifications.toasts.addDanger({
  //         title: 'Failed to list workspaces',
  //         text: response.error,
  //       });
  //       setWorkspaceOptions([]);
  //     }
  //     setLoading(false);
  //   },
  //   [coreStart]
  // );

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

        // pull data, to be deprecated
        const listResponse = await coreStart.workspaces.client.list({
          perPage: 999,
        });
        if (listResponse.success) {
          const searchedWorkspaceOptions = listResponse.result.workspaces.map(workspaceToOption);
          setWorkspaceOptions(searchedWorkspaceOptions);
        } else {
          coreStart.notifications.toasts.addDanger({
            title: 'Failed to list workspaces',
            text: listResponse.error,
          });
          setWorkspaceOptions([]);
        }
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
        // onSearchChange={onSearchChange}
        onChange={onChange}
        selectedOptions={currentWorkspace}
        singleSelection={{ asPlainText: true }}
        append={<EuiButton onClick={onCreateWorkspace}>Create workspace</EuiButton>}
      />
    </>
  );
}
