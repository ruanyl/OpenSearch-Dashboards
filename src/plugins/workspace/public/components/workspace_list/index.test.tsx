/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { WorkspaceList } from './index';
import { coreMock } from '../../../../../core/public/mocks';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@osd/i18n/react';

import { of } from 'rxjs';

import { OpenSearchDashboardsContextProvider } from '../../../../../plugins/opensearch_dashboards_react/public';

function WrapWorkspaceListInContext() {
  const coreStartMock = coreMock.createStart();

  const services = {
    ...coreStartMock,
    workspaces: {
      workspaceList$: of([
        { id: 'id1', name: 'name1' },
        { id: 'id2', name: 'name2' },
      ]),
    },
  };

  return (
    <I18nProvider>
      <OpenSearchDashboardsContextProvider services={services}>
        <WorkspaceList />
      </OpenSearchDashboardsContextProvider>
    </I18nProvider>
  );
}

describe('WorkspaceList', () => {
  it('should render title and table normally', () => {
    const { getByText, getByRole, container } = render(<WorkspaceList />);
    expect(getByText('Workspaces')).toBeInTheDocument();
    expect(getByRole('table')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });
  it('should render data in table based on workspace list data', async () => {
    const { getByText } = render(<WrapWorkspaceListInContext />);
    expect(getByText('name1')).toBeInTheDocument();
    expect(getByText('name2')).toBeInTheDocument();
  });
  it('should be able to search after input', async () => {
    const { getByText, getByRole } = render(<WrapWorkspaceListInContext />);
    expect(getByText('name1')).toBeInTheDocument();
    expect(getByText('name2')).toBeInTheDocument();
    const nameInput = getByRole('searchbox');
    fireEvent.input(nameInput, {
      target: { value: 'name1' },
    });
    await (() => {
      waitFor(() => {
        expect(getByText('name1')).toBeInTheDocument();
        expect(getByText('name2')).not.toBeInTheDocument();
      });
    });
  });
});
