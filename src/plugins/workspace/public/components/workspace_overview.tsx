/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EuiPageHeader, EuiButton, EuiPanel, EuiSpacer, EuiTitle } from '@elastic/eui';
import { useObservable } from 'react-use';
import { of } from 'rxjs';
import { ApplicationStart } from '../../../../core/public';
import { useOpenSearchDashboards } from '../../../../../src/plugins/opensearch_dashboards_react/public';
import DeleteWorkspaceModal from './delete_workspace_modal';

export const WorkspaceOverview = () => {
  const {
    services: { workspaces, application },
  } = useOpenSearchDashboards<{ application: ApplicationStart }>();

  const currentWorkspace = useObservable(
    workspaces ? workspaces.client.currentWorkspace$ : of(null)
  );

  const workspaceId = currentWorkspace?.id;
  const workspaceName = currentWorkspace?.name;
  const [deleteWorkspaceModalVisible, setDeleteWorkspaceModalVisible] = useState(false);

  const deleteWorkspace = () => {
    if (workspaceId) {
      workspaces?.client.delete(workspaceId);
      application.navigateToApp('home');
    }
    setDeleteWorkspaceModalVisible(false);
  };

  return (
    <>
      <EuiPageHeader
        pageTitle="Overview"
        rightSideItems={[
          <EuiButton color="danger" onClick={() => setDeleteWorkspaceModalVisible(true)}>
            Delete
          </EuiButton>,
          <EuiButton>Update</EuiButton>,
        ]}
      />
      <EuiPanel>
        <DeleteWorkspaceModal
          onConfirm={() => deleteWorkspace()}
          onClose={() => setDeleteWorkspaceModalVisible(false)}
          visible={deleteWorkspaceModalVisible}
          selectedItems={[workspaceName ?? 'null']}
        />
        <EuiTitle size="m">
          <h3>Workspace</h3>
        </EuiTitle>
        <EuiSpacer />
        {JSON.stringify(currentWorkspace)}
      </EuiPanel>
    </>
  );
};
