/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBottomBar,
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import React from 'react';
import { WORKSPACE_OP_TYPE_CREATE, WORKSPACE_OP_TYPE_UPDATE } from '../../../common/constants';

interface WorkspaceBottomBarProps {
  formId: string;
  opType?: string;
  showCancelModal: () => void;
}

// Number of saved changes will be implemented in workspace update page PR
export const WorkspaceBottomBar = ({
  formId,
  opType,
  showCancelModal,
}: WorkspaceBottomBarProps) => {
  return (
    <div>
      <EuiSpacer size="xl" />
      <EuiSpacer size="xl" />
      <EuiBottomBar>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s">
              {opType === WORKSPACE_OP_TYPE_UPDATE && (
                <EuiText textAlign="left">
                  {i18n.translate('workspace.form.bottomBar.unsavedChanges', {
                    defaultMessage: '1 Unsaved change(s)',
                  })}
                </EuiText>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="m">
              <EuiButtonEmpty
                color="ghost"
                onClick={showCancelModal}
                data-test-subj="workspaceForm-bottomBar-cancelButton"
              >
                {i18n.translate('workspace.form.bottomBar.cancel', {
                  defaultMessage: 'Cancel',
                })}
              </EuiButtonEmpty>
              <EuiSpacer />
              {opType === WORKSPACE_OP_TYPE_CREATE && (
                <EuiButton
                  fill
                  type="submit"
                  color="primary"
                  form={formId}
                  data-test-subj="workspaceForm-bottomBar-createButton"
                >
                  {i18n.translate('workspace.form.bottomBar.createWorkspace', {
                    defaultMessage: 'Create workspace',
                  })}
                </EuiButton>
              )}
              {opType === WORKSPACE_OP_TYPE_UPDATE && (
                <EuiButton form={formId} type="submit" fill color="primary">
                  {i18n.translate('workspace.form.bottomBar.saveChanges', {
                    defaultMessage: 'Save changes',
                  })}
                </EuiButton>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiBottomBar>
    </div>
  );
};
