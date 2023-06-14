/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { EuiPageHeader, EuiButton, EuiPanel, EuiSpacer, EuiTitle } from '@elastic/eui';
import { useObservable } from 'react-use';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

import { useOpenSearchDashboards } from '../../../../../src/plugins/opensearch_dashboards_react/public';

export const useCurrentWorkspace = () => {
  const {
    services: { workspaces },
  } = useOpenSearchDashboards();
  const workspaceObservable = useMemo(
    () =>
      workspaces
        ? workspaces.client.currentWorkspaceId$
            .pipe(switchMap((id) => workspaces.client.get(id)))
            .pipe(switchMap((response) => (response.success ? of(response.result) : of(null))))
        : of(null),
    [workspaces]
  );

  return useObservable(workspaceObservable);
};

export const WorkspaceOverview = () => {
  const currentWorkspace = useCurrentWorkspace();
  return (
    <>
      <EuiPageHeader
        pageTitle="Overview"
        rightSideItems={[
          <EuiButton color="danger">Delete</EuiButton>,
          <EuiButton>Update</EuiButton>,
        ]}
      />
      <EuiPanel>
        <EuiTitle size="m">
          <h3>Workspace</h3>
        </EuiTitle>
        <EuiSpacer />
        {JSON.stringify(currentWorkspace)}
      </EuiPanel>
    </>
  );
};
