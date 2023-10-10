/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';
import { WorkspaceFatalError } from './workspace_fatal_error';
describe('<WorkspaceFatalError />', () => {
  it('render normally', async () => {
    const { findByText, container } = render(<WorkspaceFatalError />);
    await findByText('Something went wrong');
    expect(container).toMatchSnapshot();
  });

  it('render error with callout', async () => {
    const { findByText, container } = render(<WorkspaceFatalError error="errorInCallout" />);
    await findByText('errorInCallout');
    expect(container).toMatchSnapshot();
  });
});
