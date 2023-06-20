/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFieldText,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

interface DeleteWorkspaceModalProps {
  selectedItems: string[];
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// eslint-disable-next-line import/no-default-export
export default function DeleteWorkspaceModal(props: DeleteWorkspaceModalProps) {
  const [value, setValue] = useState('');
  const { onClose, onConfirm, visible, selectedItems } = props;
  useEffect(() => {
    if (visible) {
      setValue('');
    }
  }, [visible]);
  if (!visible) {
    return null;
  }

  return (
    <EuiModal onClose={onClose}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>Delete workspace</EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiModalBody>
        <div style={{ lineHeight: 1.5 }}>
          <p>The following workspace will be permanently deleted. This action cannot be undone.</p>
          <ul style={{ listStyleType: 'disc', listStylePosition: 'inside' }}>
            {selectedItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <EuiSpacer />
          <EuiText color="subdued">
            To confirm your action, type <b style={{ color: '#000' }}>delete</b>.
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
          onClick={onConfirm}
          fill
          color="danger"
          disabled={value !== 'delete'}
        >
          Delete
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
}
