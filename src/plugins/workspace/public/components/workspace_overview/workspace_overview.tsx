/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiPanel, EuiSpacer, EuiTitle } from '@elastic/eui';
import { useObservable } from 'react-use';
import { of } from 'rxjs';

import { useOpenSearchDashboards } from '../../../../opensearch_dashboards_react/public';

export const WorkspaceOverview = () => {
  const {
    services: { workspaces },
  } = useOpenSearchDashboards();

  const currentWorkspace = useObservable(workspaces ? workspaces.currentWorkspace$ : of(null));

  return (
    <>
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
