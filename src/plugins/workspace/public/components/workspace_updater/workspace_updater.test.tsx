/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PublicAppInfo, WorkspaceObject } from 'opensearch-dashboards/public';
import { fireEvent, render } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { WorkspaceUpdater as WorkspaceUpdaterComponent } from './workspace_updater';
import { coreMock } from '../../../../../core/public/mocks';
import { createOpenSearchDashboardsReactContext } from '../../../../opensearch_dashboards_react/public';
import {
  WORKSPACE_UPDATE_APP_ID,
  WORKSPACE_OVERVIEW_APP_ID,
  DEFAULT_CHECKED_FEATURES_IDS,
} from '../../../common/constants';

const workspaceClientUpdate = jest
  .fn()
  .mockReturnValue({ result: { id: 'successResult' }, success: true });

const navigateToApp = jest.fn();
const notificationToastsAddSuccess = jest.fn();
const notificationToastsAddDanger = jest.fn();

// upon initialization on workspace settings page, two features (workspace overview and workspace settings) are automatically checked
const PublicAPPInfoMap = new Map([
  ['app1', { id: 'app1', title: 'app1' }],
  ['app2', { id: 'app2', title: 'app2', category: { id: 'category1', label: 'category1' } }],
  ['app3', { id: 'app3', category: { id: 'category1', label: 'category1' } }],
  ['app4', { id: 'app4', category: { id: 'category2', label: 'category2' } }],
  ['app5', { id: 'app5', category: { id: 'category2', label: 'category2' } }],
  [WORKSPACE_UPDATE_APP_ID, { id: WORKSPACE_UPDATE_APP_ID, title: 'Workspace Settings' }],
  [WORKSPACE_OVERVIEW_APP_ID, { id: WORKSPACE_OVERVIEW_APP_ID, title: 'Overview' }],
]);

const mockCoreStart = coreMock.createStart();

const WorkspaceUpdater = (props: any) => {
  const { Provider } = createOpenSearchDashboardsReactContext({
    ...mockCoreStart,
    ...{
      application: {
        ...mockCoreStart.application,
        capabilities: {
          ...mockCoreStart.application.capabilities,
          workspaces: {
            permissionEnabled: true,
          },
        },
        navigateToApp,
        getUrlForApp: jest.fn(),
        applications$: new BehaviorSubject<Map<string, PublicAppInfo>>(PublicAPPInfoMap as any),
      },
      http: {
        ...mockCoreStart.http,
        basePath: {
          ...mockCoreStart.http.basePath,
          remove: jest.fn(),
          prepend: jest.fn(),
        },
      },
      notifications: {
        ...mockCoreStart.notifications,
        toasts: {
          ...mockCoreStart.notifications.toasts,
          addDanger: notificationToastsAddDanger,
          addSuccess: notificationToastsAddSuccess,
        },
      },
      workspaceClient: {
        update: workspaceClientUpdate,
      },
      workspaces: {
        ...mockCoreStart.workspaces,
        currentWorkspace$: new BehaviorSubject<WorkspaceObject | null>({
          id: 'test workspace id',
          name: 'test workspace name',
          features: DEFAULT_CHECKED_FEATURES_IDS,
        }),
      },
    },
  });

  return (
    <Provider>
      <WorkspaceUpdaterComponent {...props} />
    </Provider>
  );
};

function clearMockedFunctions() {
  workspaceClientUpdate.mockClear();
  notificationToastsAddDanger.mockClear();
  notificationToastsAddSuccess.mockClear();
}

describe('WorkspaceUpdater', () => {
  beforeEach(() => clearMockedFunctions());
  const { location } = window;
  const setHrefSpy = jest.fn((href) => href);

  beforeAll(() => {
    if (window.location) {
      // @ts-ignore
      delete window.location;
    }
    window.location = {} as Location;
    Object.defineProperty(window.location, 'href', {
      get: () => 'http://localhost/',
      set: setHrefSpy,
    });
  });

  afterAll(() => {
    window.location = location;
  });

  it('cannot update workspace when name empty', async () => {
    const { getByTestId } = render(<WorkspaceUpdater />);
    fireEvent.click(getByTestId('workspaceForm-tabSelection-workspaceSettings'));
    const nameInput = getByTestId('workspaceForm-workspaceDetails-nameInputText');
    fireEvent.input(nameInput, {
      target: { value: '' },
    });
    fireEvent.click(getByTestId('workspaceForm-bottomBar-updateButton'));
    expect(workspaceClientUpdate).not.toHaveBeenCalled();
  });

  it('cannot update workspace with invalid name', async () => {
    const { getByTestId } = render(<WorkspaceUpdater />);
    fireEvent.click(getByTestId('workspaceForm-tabSelection-workspaceSettings'));
    const nameInput = getByTestId('workspaceForm-workspaceDetails-nameInputText');
    fireEvent.input(nameInput, {
      target: { value: '~' },
    });
    expect(workspaceClientUpdate).not.toHaveBeenCalled();
  });

  it('cannot create workspace with invalid description', async () => {
    const { getByTestId } = render(<WorkspaceUpdater />);
    fireEvent.click(getByTestId('workspaceForm-tabSelection-workspaceSettings'));
    const descriptionInput = getByTestId('workspaceForm-workspaceDetails-descriptionInputText');
    fireEvent.input(descriptionInput, {
      target: { value: '~' },
    });
    expect(workspaceClientUpdate).not.toHaveBeenCalled();
  });

  it('cancel update workspace', async () => {
    const { findByText, getByTestId } = render(<WorkspaceUpdater />);
    fireEvent.click(getByTestId('workspaceForm-bottomBar-cancelButton'));
    await findByText('Discard changes?');
    fireEvent.click(getByTestId('confirmModalConfirmButton'));
    expect(navigateToApp).toHaveBeenCalled();
  });
});
