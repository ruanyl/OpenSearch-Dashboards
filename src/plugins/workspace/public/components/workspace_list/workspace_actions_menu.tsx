/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';

import { EuiButtonIcon, EuiContextMenuPanel, EuiContextMenuItem, EuiPopover } from '@elastic/eui';
import { DeleteWorkspaceModal } from '../delete_workspace_modal';
import { WorkspaceAttribute } from '../../../../../core/public';

interface Props {
  workspace: WorkspaceAttribute;
}

export const WorkspaceActionsMenu = ({ workspace }: Props) => {
  const [isPopoverOpen, setPopover] = useState(false);
  const [deleteWorkspaceModalVisible, setDeleteWorkspaceModalVisible] = useState(false);

  const onButtonClick = () => {
    setPopover(!isPopoverOpen);
  };

  const closePopover = () => {
    setPopover(false);
  };

  const handleDeleteWorkspace = () => {
    setDeleteWorkspaceModalVisible(true);
    closePopover();
  };

  const items = [
    <EuiContextMenuItem key="delete" icon="trash" onClick={handleDeleteWorkspace}>
      Delete
    </EuiContextMenuItem>,
  ];

  const button = (
    <EuiButtonIcon
      iconType="boxesHorizontal"
      aria-label="Heart"
      color="accent"
      onClick={onButtonClick}
    />
  );

  return (
    <>
      {deleteWorkspaceModalVisible && (
        <DeleteWorkspaceModal
          selectedWorkspace={workspace}
          onClose={() => setDeleteWorkspaceModalVisible(false)}
          returnToHome={false}
        />
      )}
      <EuiPopover
        id="workspace_actions_menu"
        button={button}
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        panelPaddingSize="none"
        anchorPosition="downLeft"
      >
        <EuiContextMenuPanel size="m" items={items} />
      </EuiPopover>
    </>
  );
};
