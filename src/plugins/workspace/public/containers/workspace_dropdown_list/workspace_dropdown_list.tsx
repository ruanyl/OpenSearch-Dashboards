/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';

import { EuiButton, EuiComboBox, EuiComboBoxOptionOption } from '@elastic/eui';
import useObservable from 'react-use/lib/useObservable';
import { CoreStart, WorkspaceAttribute } from '../../../../../core/public';

type WorkspaceOption = EuiComboBoxOptionOption<WorkspaceAttribute>;

interface WorkspaceDropdownListProps {
  coreStart: CoreStart;
  onCreateWorkspace: () => void;
}

function workspaceToOption(workspace: WorkspaceAttribute): WorkspaceOption {
  return { label: workspace.name, key: workspace.id, value: workspace };
}

export function WorkspaceDropdownList(props: WorkspaceDropdownListProps) {
  const { coreStart, onCreateWorkspace } = props;
  const workspaceList = useObservable(coreStart.workspaces.client.workspaceList$, []);
  const currentWorkspaceId = useObservable(coreStart.workspaces.client.currentWorkspaceId$, '');

  const [loading, setLoading] = useState(false);
  const [workspaceOptions, setWorkspaceOptions] = useState([] as WorkspaceOption[]);

  const currentWorkspaceOption = useMemo(() => {
    const workspace = workspaceList.find((item) => item.id === currentWorkspaceId);
    if (!workspace) {
      coreStart.notifications.toasts.addDanger(
        `can not get current workspace of id [${currentWorkspaceId}]`
      );
      return [workspaceToOption({ id: currentWorkspaceId, name: '' })];
    }
    return [workspaceToOption(workspace)];
  }, [workspaceList, currentWorkspaceId, coreStart]);
  const allWorkspaceOptions = useMemo(() => {
    return workspaceList.map(workspaceToOption);
  }, [workspaceList]);

  const onSearchChange = useCallback(
    (searchValue: string) => {
      setWorkspaceOptions(allWorkspaceOptions.filter((item) => item.label.includes(searchValue)));
    },
    [allWorkspaceOptions]
  );

  const onChange = useCallback(
    (workspaceOption: WorkspaceOption[]) => {
      /** switch the workspace */
      setLoading(true);
      const id = workspaceOption[0].key!;
      const newUrl = coreStart.workspaces?.formatUrlWithWorkspaceId(window.location.href, id);
      if (newUrl) {
        window.location.href = newUrl;
      }
      setLoading(false);
    },
    [coreStart.workspaces]
  );

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
