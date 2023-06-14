/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { EuiSelect, EuiTitle } from '@elastic/eui';
import { useCallback } from 'react';
import { useOpenSearchDashboards } from '../../../../../plugins/opensearch_dashboards_react/public';

export const WorkspaceSwitch = () => {
  const {
    services: { workspaces },
  } = useOpenSearchDashboards();

  const onWorkspaceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setCurrentWorkspaceId(id);
    workspaces?.client.enterWorkspace(id);
    // TODO: call jump
  };

  const getOptions = useCallback(async () => {
    const data = await workspaces?.client.list();
    if (data?.success) {
      const list = data.result.workspaces;
      const options = list.map((item) => ({ value: item.id, text: item.name }));
      setOptions(options);
    }
  }, [workspaces]);

  const getCurrentWorkspace = useCallback(async () => {
    const data = await workspaces?.client.getCurrentWorkspaceId();
    if (data?.success) {
      setCurrentWorkspaceId(data.result);
    }
  }, [workspaces]);

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState('');
  const [options, setOptions] = useState<Array<{ value: string; text: string }>>([]);

  useEffect(() => {
    getOptions();
    getCurrentWorkspace();
  }, [getOptions, getCurrentWorkspace]);

  return (
    <>
      <EuiTitle size="xs">
        <h4>Switch Workspaces</h4>
      </EuiTitle>
      <EuiSelect options={options} value={currentWorkspaceId} onChange={onWorkspaceChange} />
    </>
  );
};
