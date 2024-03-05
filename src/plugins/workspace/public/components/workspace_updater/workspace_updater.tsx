/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPageContent,
  EuiButton,
  EuiPanel,
  EuiSpacer,
} from '@elastic/eui';
import { useObservable } from 'react-use';
import { i18n } from '@osd/i18n';
import { of } from 'rxjs';
import { WorkspaceAttribute } from 'opensearch-dashboards/public';
import { useOpenSearchDashboards } from '../../../../opensearch_dashboards_react/public';
import {
  WorkspaceForm,
  WorkspaceFormSubmitData,
  WorkspaceFormData,
} from '../workspace_creator/workspace_form';
import { WORKSPACE_OVERVIEW_APP_ID, WORKSPACE_OP_TYPE_UPDATE } from '../../../common/constants';
import { DeleteWorkspaceModal } from '../delete_workspace_modal';
import { formatUrlWithWorkspaceId } from '../../../../../core/public/utils';
import { WorkspaceClient } from '../../workspace_client';
import { WorkspacePermissionSetting } from '../';

interface WorkspaceWithPermission extends WorkspaceAttribute {
  permissions?: WorkspacePermissionSetting[];
}

function getFormDataFromWorkspace(
  currentWorkspace: WorkspaceAttribute | null | undefined
): WorkspaceFormData {
  const currentWorkspaceWithPermission = (currentWorkspace || {}) as WorkspaceWithPermission;
  return {
    ...currentWorkspaceWithPermission,
    permissions: currentWorkspaceWithPermission.permissions || [],
  };
}
export const WorkspaceUpdater = () => {
  const {
    services: { application, workspaces, notifications, http, workspaceClient },
  } = useOpenSearchDashboards<{ workspaceClient: WorkspaceClient }>();

  const isPermissionEnabled = application?.capabilities.workspaces.permissionEnabled;

  const currentWorkspace = useObservable(workspaces ? workspaces.currentWorkspace$ : of(null));
  const hideDeleteButton = !!currentWorkspace?.reserved; // hide delete button for reserved workspace
  const [deleteWorkspaceModalVisible, setDeleteWorkspaceModalVisible] = useState(false);
  const [currentWorkspaceFormData, setCurrentWorkspaceFormData] = useState<WorkspaceFormData>(
    getFormDataFromWorkspace(currentWorkspace)
  );

  useEffect(() => {
    setCurrentWorkspaceFormData(getFormDataFromWorkspace(currentWorkspace));
  }, [currentWorkspace]);

  const handleWorkspaceFormSubmit = useCallback(
    async (data: WorkspaceFormSubmitData) => {
      let result;
      if (!currentWorkspace) {
        notifications?.toasts.addDanger({
          title: i18n.translate('Cannot find current workspace', {
            defaultMessage: 'Cannot update workspace',
          }),
        });
        return;
      }
      try {
        const { permissions, ...attributes } = data;
        result = await workspaceClient.update(currentWorkspace?.id, attributes, permissions);
      } catch (error) {
        notifications?.toasts.addDanger({
          title: i18n.translate('workspace.update.failed', {
            defaultMessage: 'Failed to update workspace',
          }),
          text: error instanceof Error ? error.message : JSON.stringify(error),
        });
        return;
      }
      if (result?.success) {
        notifications?.toasts.addSuccess({
          title: i18n.translate('workspace.update.success', {
            defaultMessage: 'Update workspace successfully',
          }),
        });
        if (application && http) {
          window.location.href =
            formatUrlWithWorkspaceId(
              application.getUrlForApp(WORKSPACE_OVERVIEW_APP_ID, {
                absolute: true,
              }),
              currentWorkspace.id,
              http.basePath
            ) || '';
        }
        return;
      }
      notifications?.toasts.addDanger({
        title: i18n.translate('workspace.update.failed', {
          defaultMessage: 'Failed to update workspace',
        }),
        text: result?.error,
      });
    },
    [notifications?.toasts, currentWorkspace, application, http, workspaceClient]
  );

  if (!currentWorkspaceFormData.name) {
    return null;
  }

  return (
    <EuiPage paddingSize="none">
      <EuiPageBody>
        <EuiPageHeader
          restrictWidth
          pageTitle={`${currentWorkspace?.name ?? 'Workspace'} details`}
          rightSideItems={
            hideDeleteButton
              ? []
              : [
                  <EuiButton color="danger" onClick={() => setDeleteWorkspaceModalVisible(true)}>
                    Delete
                  </EuiButton>,
                ]
          }
        />
        <EuiSpacer />
        <EuiPageContent
          verticalPosition="center"
          horizontalPosition="center"
          paddingSize="none"
          color="subdued"
          hasShadow={false}
          style={{ width: '100%', maxWidth: 1000 }}
        >
          {deleteWorkspaceModalVisible && (
            <EuiPanel>
              <DeleteWorkspaceModal
                selectedWorkspace={currentWorkspace}
                onClose={() => setDeleteWorkspaceModalVisible(false)}
                returnToHome={true}
              />
            </EuiPanel>
          )}
          {application && (
            <WorkspaceForm
              application={application}
              onSubmit={handleWorkspaceFormSubmit}
              defaultValues={currentWorkspaceFormData}
              opType={WORKSPACE_OP_TYPE_UPDATE}
              permissionEnabled={isPermissionEnabled}
            />
          )}
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
};
