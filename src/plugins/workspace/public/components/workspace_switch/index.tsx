/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { EuiSelect, EuiTitle } from '@elastic/eui';
import { useCallback } from 'react';
import { WorkspacesStart } from '../../../../../core/public';

interface Props {
  workspaces: WorkspacesStart;
}

export const WorkspaceSwitch = ({ workspaces }: Props) => {
  const client = workspaces.client;

  const onWorkspaceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setCurrentWorkspaceId(id);
    client.enterWorkspace(id);
  };

  const getOptions = useCallback(async () => {
    const { result } = await client.list();
    if (result) {
      const list = result.workspaces;
      const options = list.map((item) => ({ value: item.id, name: item.name }));
      setOptions(options);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCurrentWorkspace = useCallback(async () => {
    const { result } = await client.getCurrentWorkspaceId();
    if (result) {
      setCurrentWorkspaceId(result);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState('');
  const [options, setOptions] = useState([]);

  useEffect(() => {
    getOptions();
    getCurrentWorkspace();
  }, [getOptions, getCurrentWorkspace]);

  return (
    <>
      <EuiTitle size="xs">
        <h4>Switch Workspace</h4>
      </EuiTitle>
      <EuiSelect options={options} value={currentWorkspaceId} onChange={onWorkspaceChange} />
    </>
  );
};
