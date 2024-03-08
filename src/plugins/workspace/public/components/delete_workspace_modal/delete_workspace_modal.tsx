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
import { SavedObjectsFindOptions, WorkspaceAttribute } from 'opensearch-dashboards/public';
import { i18n } from '@osd/i18n';
import { useOpenSearchDashboards } from '../../../../opensearch_dashboards_react/public';
import { WorkspaceClient } from '../../workspace_client';
import { getAllowedTypes } from './get_allowed_types';
import { moveToTargetWorkspace } from './move_to_target_workspace';

type WorkspaceOption = EuiComboBoxOptionOption<WorkspaceAttribute>;
interface SaveObjectToMove {
  id: string;
  type: string;
  workspaces: string[];
  attributes: any;
}

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
    services: { application, notifications, http, workspaceClient, savedObjects, workspaces },
  } = useOpenSearchDashboards<{ workspaceClient: WorkspaceClient }>();

  const savedObjectsClient = savedObjects!.client;
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [targetWorkspaceOption, setTargetWorkspaceOption] = useState<WorkspaceOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const targetWorkspaceId = targetWorkspaceOption?.at(0)?.key;
  let confirmDuplicateButtonEnabled = false;
  const [savedObjectsCount, setSavedObjectsCount] = useState(0);
  const [allowedTypes, setAllowedTypes] = useState<string[]>([]);
  const maxObjectsAmount: number = 200;
  const onTargetWorkspaceChange = (targetOption: WorkspaceOption[]) => {
    setTargetWorkspaceOption(targetOption);
  };

  if (!!targetWorkspaceId && savedObjectsCount > 0) {
    confirmDuplicateButtonEnabled = true;
  }

  useEffect(() => {
    const workspaceList = workspaces!.workspaceList$.value;
    const initWorkspaceOptions = [
      ...workspaceList
        .filter((workspace: WorkspaceAttribute) => !workspace.libraryReadonly)
        .filter((workspace: WorkspaceAttribute) => workspace.id !== selectedWorkspace?.id)
        .map((workspace: WorkspaceAttribute) => workspaceToOption(workspace)),
    ];
    setWorkspaceOptions(initWorkspaceOptions);
    fetchSavedObjectsCount();
  }, [workspaces]);

  const fetchSavedObjectsCount = async () => {
    const types = await getAllowedTypes(http!);
    const findOptions: SavedObjectsFindOptions = {
      workspaces: [selectedWorkspace?.id as string],
      fields: ['id'],
      type: types,
      perPage: 1,
    };

    try {
      const resp = await savedObjectsClient.find(findOptions);
      setAllowedTypes(types);
      setSavedObjectsCount(resp.total);
    } catch (error) {
      notifications?.toasts.addDanger({
        title: i18n.translate(
          'workspace.deleteWorkspaceModal.unableFindSavedObjectsNotificationMessage',
          { defaultMessage: 'Unable find saved objects count' }
        ),
        text: `${error}`,
      });
    }
  };

  const fetchObjects = async () => {
    const findOptions: SavedObjectsFindOptions = {
      workspaces: [selectedWorkspace?.id as string],
      type: allowedTypes,
      perPage: maxObjectsAmount,
    };

    try {
      return await savedObjectsClient.find(findOptions);
    } catch (error) {
      notifications?.toasts.addDanger({
        title: i18n.translate(
          'workspace.deleteWorkspaceModal.unableFindSavedObjectsNotificationMessage',
          { defaultMessage: 'Unable find saved objects' }
        ),
        text: `${error}`,
      });
    }
  };

  const moveObjectsToTargetWorkspace = async () => {
    setIsLoading(true);
    try {
      for (let i = 1; i <= Math.ceil(savedObjectsCount / maxObjectsAmount); i++) {
        const resp = await fetchObjects();
        if (resp!.total === 0) break;
        const objects: SaveObjectToMove[] = resp!.savedObjects.map((obj) => ({
          id: obj.id,
          type: obj.type,
          workspaces: obj.workspaces!,
          attributes: obj.attributes,
        }));
        await moveToTargetWorkspace(
          http!,
          objects,
          selectedWorkspace?.id as string,
          targetWorkspaceId as string
        );
        if (resp!.total < maxObjectsAmount) break;
      }
      setSavedObjectsCount(0);
      notifications?.toasts.addSuccess({
        title: i18n.translate('workspace.deleteWorkspaceModal.move.successNotification', {
          defaultMessage: 'Move ' + savedObjectsCount + ' saved objects successfully',
        }),
      });
    } catch (e) {
      notifications?.toasts.addDanger({
        title: i18n.translate('workspace.deleteWorkspaceModal.move.dangerNotification', {
          defaultMessage: 'Unable to move ' + savedObjectsCount + ' saved objects',
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
            isInvalid={!confirmDuplicateButtonEnabled}
          />
          <EuiSpacer size="m" />

          <EuiButton
            data-test-subj="Duplicate All button"
            onClick={moveObjectsToTargetWorkspace}
            fill
            color="primary"
            size="s"
            disabled={!confirmDuplicateButtonEnabled}
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
