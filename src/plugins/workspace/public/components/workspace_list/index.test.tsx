/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { shallow } from 'enzyme';
import { WorkspaceList } from './index';
import { coreMock } from '../../../../../core/public/mocks';
import { render, waitFor } from '@testing-library/react';

import { of } from 'rxjs';

jest.doMock('../../../../opensearch_dashboards_react/public', () => ({
  useOpenSearchDashboards: jest.fn().mockReturnValue({
    services: coreMock.createStart(),
  }),
}));

test('render normally', () => {
  const component = shallow(<WorkspaceList />);
  expect(component).toMatchSnapshot();
});

describe('WorkspaceList', function () {
  it('should render title and table regularly', () => {
    const { getByText, getByRole } = render(<WorkspaceList />);
    expect(getByText('Workspaces')).toBeInTheDocument();
    expect(getByRole('table')).toBeInTheDocument();
  });

  it('should render data in table based on workspace list', async () => {
    jest.doMock('../../../../opensearch_dashboards_react/public', () => ({
      useOpenSearchDashboards: jest.fn().mockReturnValue({
        services: {
          ...coreMock.createStart(),
          workspaces: {
            workspaceList$: of([
              { id: 'id1', name: 'name1' },
              { id: 'id2', name: 'name2' },
            ]),
          },
        },
      }),
    }));
    const { getByText } = render(<WorkspaceList />);
    await waitFor(() => {
      expect(getByText('name1')).toBeInTheDocument();
    });
  });
});
