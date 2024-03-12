/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFieldText,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { WorkspaceAttribute, WorkspaceObject } from 'opensearch-dashboards/public';
import { i18n } from '@osd/i18n';
import { useObservable } from 'react-use';
import { useOpenSearchDashboards } from '../../../../opensearch_dashboards_react/public';
import { WorkspaceClient } from '../../workspace_client';

type WorkspaceOption = EuiComboBoxOptionOption<WorkspaceAttribute>;

function workspaceToOption(workspace: WorkspaceAttribute): WorkspaceOption {
  return {
    label: workspace.name,
    key: workspace.id,
    value: workspace,
  };
}
interface DeleteWorkspaceModalProps {
  onClose: () => void;
  selectedWorkspace?: WorkspaceAttribute | null;
  returnToHome: boolean;
}

export function DeleteWorkspaceModal(props: DeleteWorkspaceModalProps) {
  const [value, setValue] = useState('');
  const { onClose, selectedWorkspace, returnToHome } = props;
  const {
    services: { application, notifications, http, workspaceClient, workspaces },
  } = useOpenSearchDashboards<{ workspaceClient: WorkspaceClient }>();

  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [targetWorkspaceOption, setTargetWorkspaceOption] = useState<WorkspaceOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const targetWorkspaceId = targetWorkspaceOption?.at(0)?.key;
  const onTargetWorkspaceChange = (targetOption: WorkspaceOption[]) => {
    setTargetWorkspaceOption(targetOption);
  };

  const workspaceList = useObservable<WorkspaceObject[]>(workspaces!.workspaceList$);

  useEffect(() => {
    if (workspaceList) {
      const initWorkspaceOptions = [
        ...workspaceList!
          .filter((workspace) => !workspace.libraryReadonly)
          .filter((workspace) => workspace.id !== selectedWorkspace?.id)
          .map((workspace) => workspaceToOption(workspace)),
      ];
      setWorkspaceOptions(initWorkspaceOptions);
    }
  }, [workspaceList]);

  const moveObjectsToTargetWorkspace = async () => {
    setIsLoading(true);
    try {
      const result = await workspaceClient.moveAllObjects(
        selectedWorkspace?.id as string,
        targetWorkspaceId as string
      );
      notifications?.toasts.addSuccess({
        title: i18n.translate('workspace.deleteWorkspaceModal.move.successNotification', {
          defaultMessage: 'Moved ' + result.length + ' saved objects successfully',
        }),
      });
    } catch (e) {
      notifications?.toasts.addDanger({
        title: i18n.translate('workspace.deleteWorkspaceModal.move.dangerNotification', {
          defaultMessage: 'Unable to move saved objects',
        }),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteWorkspace = async () => {
    if (selectedWorkspace?.id) {
      let result;
      try {
        result = await workspaceClient.delete(selectedWorkspace?.id);
      } catch (error) {
        notifications?.toasts.addDanger({
          title: i18n.translate('workspace.delete.failed', {
            defaultMessage: 'Failed to delete workspace',
          }),
          text: error instanceof Error ? error.message : JSON.stringify(error),
        });
        return onClose();
      }
      if (result?.success) {
        notifications?.toasts.addSuccess({
          title: i18n.translate('workspace.delete.success', {
            defaultMessage: 'Delete workspace successfully',
          }),
        });
        onClose();
        if (http && application && returnToHome) {
          const homeUrl = application.getUrlForApp('home', {
            path: '/',
            absolute: false,
          });
          const targetUrl = http.basePath.prepend(http.basePath.remove(homeUrl), {
            withoutWorkspace: true,
          });
          await application.navigateToUrl(targetUrl);
        }
      } else {
        notifications?.toasts.addDanger({
          title: i18n.translate('workspace.delete.failed', {
            defaultMessage: 'Failed to delete workspace',
          }),
          text: result?.error,
        });
      }
    }
  };

  return (
    <EuiModal onClose={onClose}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>Delete workspace</EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiModalBody>
        <div style={{ lineHeight: 1.5 }}>
          <EuiText>
            Before deleting the workspace, you have the option to keep the saved objects by moving
            them to a target workspace.
          </EuiText>
          <EuiSpacer size="s" />

          <EuiComboBox
            placeholder="Please select a target workspace"
            options={workspaceOptions}
            selectedOptions={targetWorkspaceOption}
            onChange={onTargetWorkspaceChange}
            singleSelection={{ asPlainText: true }}
            isClearable={false}
            isInvalid={!targetWorkspaceId}
          />
          <EuiSpacer size="m" />

          <EuiButton
            data-test-subj="Move All button"
            onClick={moveObjectsToTargetWorkspace}
            fill
            color="primary"
            size="s"
            disabled={!targetWorkspaceId || isLoading}
            isLoading={isLoading}
          >
            Move All
          </EuiButton>
          <EuiSpacer />
        </div>
        <div style={{ lineHeight: 1.5 }}>
          <p>The following workspace will be permanently deleted. This action cannot be undone.</p>
          <ul style={{ listStyleType: 'disc', listStylePosition: 'inside' }}>
            {selectedWorkspace?.name ? <li>{selectedWorkspace.name}</li> : null}
          </ul>
          <EuiSpacer />
          <EuiText color="subdued">
            To confirm your action, type <b>delete</b>.
          </EuiText>
          <EuiFieldText
            placeholder="delete"
            fullWidth
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      </EuiModalBody>

      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose}>Cancel</EuiButtonEmpty>
        <EuiButton
          data-test-subj="Delete Confirm button"
          onClick={deleteWorkspace}
          fill
          color="danger"
          disabled={value !== 'delete' || isLoading}
        >
          Delete
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
}
