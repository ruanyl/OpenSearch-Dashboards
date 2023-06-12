/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiSpacer, EuiTitle } from '@elastic/eui';

import { useOpenSearchDashboards } from '../../../../../plugins/opensearch_dashboards_react/public';

import { WorkspaceForm } from './workspace_form';

export const WorkspaceCreator = () => {
  const {
    services: { application },
  } = useOpenSearchDashboards();
  return (
    <div>
      <EuiTitle>
        <h1>Create Workspace</h1>
      </EuiTitle>
      <EuiSpacer />
      {application && <WorkspaceForm application={application} />}
    </div>
  );
};
