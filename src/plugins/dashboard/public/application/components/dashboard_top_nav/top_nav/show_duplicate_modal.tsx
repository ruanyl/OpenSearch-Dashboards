/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import ReactDOM from 'react-dom';
import { WorkspaceAttribute, WorkspaceStart } from 'opensearch-dashboards/public';
import { SavedObjectWithMetadata } from '../../../../../../saved_objects_management/public';

interface MinimalDuplicateModalProps {
  selectedSavedObjects: SavedObjectWithMetadata[];
  workspaces: WorkspaceStart;
  getDuplicateWorkspaces: (...args: any[]) => Promise<WorkspaceAttribute[]>;
  onDuplicate: (...args: any[]) => Promise<void>;
  onClose: () => void;
}

export function showDuplicateModal(duplicateModal: React.ReactElement<MinimalDuplicateModalProps>) {
  const container = document.createElement('div');
  const closeModal = () => {
    ReactDOM.unmountComponentAtNode(container);
    document.body.removeChild(container);
  };

  const onDuplicate = duplicateModal.props.onDuplicate;
  const onDuplicateConfirmed: MinimalDuplicateModalProps['onDuplicate'] = async (...args) => {
    await onDuplicate(...args);
    closeModal();
  };

  document.body.appendChild(container);

  const element = React.cloneElement(duplicateModal, {
    onDuplicate: onDuplicateConfirmed,
    onClose: closeModal,
  });

  ReactDOM.render(element, container);
}
