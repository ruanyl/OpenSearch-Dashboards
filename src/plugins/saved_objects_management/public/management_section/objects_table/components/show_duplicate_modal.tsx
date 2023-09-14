/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

import React from 'react';
import ReactDOM from 'react-dom';
import { SavedObjectsDuplicateModalProps } from './duplicate_modal';
import { I18nStart } from '../../../../../../core/public';

/**
 * Represents the result of trying to duplicate the saved object.
 * Contains `error` prop if something unexpected happened (e.g. network error).
 * Contains an `id` if persisting was successful. If `id` and
 * `error` are undefined, persisting was not successful, but the
 * modal can still recover (e.g. the name of the saved object was already taken).
 */

export function showDuplicateModal(
  duplicateModal: React.ReactElement<SavedObjectsDuplicateModalProps>,
  I18nContext: I18nStart['Context']
) {
  const container = document.createElement('div');
  const closeModal = () => {
    ReactDOM.unmountComponentAtNode(container);
    document.body.removeChild(container);
  };

  const onDuplicate = duplicateModal.props.onDuplicate;

  const onDuplicateConfirmed: SavedObjectsDuplicateModalProps['onDuplicate'] = async (...args) => {
    await onDuplicate(...args);
    closeModal();
  };

  document.body.appendChild(container);
  const element = React.cloneElement(duplicateModal, {
    onDuplicate: onDuplicateConfirmed,
    onClose: closeModal,
  });

  ReactDOM.render(<I18nContext>{element}</I18nContext>, container);
}
