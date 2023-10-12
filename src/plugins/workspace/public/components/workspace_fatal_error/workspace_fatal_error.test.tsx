/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { IntlProvider } from 'react-intl';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { WorkspaceFatalError } from './workspace_fatal_error';

describe('<WorkspaceFatalError />', () => {
  it('render normally', async () => {
    const { findByText, container } = render(
      <IntlProvider locale="en">
        <WorkspaceFatalError />
      </IntlProvider>
    );
    await findByText('Something went wrong');
    expect(container).toMatchSnapshot();
  });

  it('render error with callout', async () => {
    const { findByText, container } = render(
      <IntlProvider locale="en">
        <WorkspaceFatalError error="errorInCallout" />
      </IntlProvider>
    );
    await findByText('errorInCallout');
    expect(container).toMatchSnapshot();
  });

  it('click go back to home', async () => {
    const { location } = window;
    const setHrefSpy = jest.fn((href) => href);
    if (window.location) {
      // @ts-ignore
      delete window.location;
    }
    window.location = {} as Location;
    Object.defineProperty(window.location, 'href', {
      get: () => 'http://localhost/',
      set: setHrefSpy,
    });
    const { getByText } = render(
      <IntlProvider locale="en">
        <WorkspaceFatalError error="errorInCallout" />
      </IntlProvider>
    );
    fireEvent.click(getByText('Go back to home'));
    await waitFor(
      () => {
        expect(setHrefSpy).toBeCalledTimes(1);
      },
      {
        container: document.body,
      }
    );
    window.location = location;
  });
});
