/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { workspaceClientMock, WorkspaceClientMock } from './workspace_client.mock';
import { applicationServiceMock, chromeServiceMock, coreMock } from '../../../core/public/mocks';
import { WorkspacePlugin } from './plugin';
import { WORKSPACE_FATAL_ERROR_APP_ID, WORKSPACE_OVERVIEW_APP_ID } from '../common/constants';
import { Observable, Subscriber } from 'rxjs';

describe('Workspace plugin', () => {
  beforeEach(() => {
    WorkspaceClientMock.mockClear();
    Object.values(workspaceClientMock).forEach((item) => item.mockClear());
  });
  it('#setup', async () => {
    const setupMock = coreMock.createSetup();
    const workspacePlugin = new WorkspacePlugin();
    await workspacePlugin.setup(setupMock);
    expect(setupMock.application.register).toBeCalledTimes(1);
    expect(WorkspaceClientMock).toBeCalledTimes(1);
    expect(workspaceClientMock.enterWorkspace).toBeCalledTimes(0);
  });

  it('#setup when workspace id is in url and enterWorkspace return error', async () => {
    const windowSpy = jest.spyOn(window, 'window', 'get');
    windowSpy.mockImplementation(
      () =>
        ({
          location: {
            href: 'http://localhost/w/workspaceId/app',
          },
        } as any)
    );
    workspaceClientMock.enterWorkspace.mockResolvedValue({
      success: false,
      error: 'error',
    });
    const setupMock = coreMock.createSetup();
    const applicationStartMock = applicationServiceMock.createStartContract();
    const chromeStartMock = chromeServiceMock.createStartContract();
    setupMock.getStartServices.mockImplementation(() => {
      return Promise.resolve([
        {
          application: applicationStartMock,
          chrome: chromeStartMock,
        },
        {},
        {},
      ]) as any;
    });

    const workspacePlugin = new WorkspacePlugin();
    await workspacePlugin.setup(setupMock);
    expect(setupMock.application.register).toBeCalledTimes(1);
    expect(WorkspaceClientMock).toBeCalledTimes(1);
    expect(workspaceClientMock.enterWorkspace).toBeCalledWith('workspaceId');
    expect(setupMock.getStartServices).toBeCalledTimes(1);
    await new Promise((resolve: any) => setTimeout(resolve, 1000));
    expect(applicationStartMock.navigateToApp).toBeCalledWith(WORKSPACE_FATAL_ERROR_APP_ID, {
      replace: true,
      state: {
        error: 'error',
      },
    });
    windowSpy.mockRestore();
  });

  it('#setup when workspace id is in url and enterWorkspace return success', async () => {
    const windowSpy = jest.spyOn(window, 'window', 'get');
    windowSpy.mockImplementation(
      () =>
        ({
          location: {
            href: 'http://localhost/w/workspaceId/app',
          },
        } as any)
    );
    workspaceClientMock.enterWorkspace.mockResolvedValue({
      success: true,
      error: 'error',
    });
    const setupMock = coreMock.createSetup();
    const applicationStartMock = applicationServiceMock.createStartContract();
    let currentAppIdSubscriber: Subscriber<string> | undefined;
    setupMock.getStartServices.mockImplementation(() => {
      return Promise.resolve([
        {
          application: {
            ...applicationStartMock,
            currentAppId$: new Observable((subscriber) => {
              currentAppIdSubscriber = subscriber;
            }),
          },
        },
        {},
        {},
      ]) as any;
    });

    const workspacePlugin = new WorkspacePlugin();
    await workspacePlugin.setup(setupMock);
    await new Promise((resolve: any) => setTimeout(resolve, 0));
    currentAppIdSubscriber?.next(WORKSPACE_FATAL_ERROR_APP_ID);
    await new Promise((resolve: any) => setTimeout(resolve, 0));
    expect(applicationStartMock.navigateToApp).toBeCalledWith(WORKSPACE_OVERVIEW_APP_ID);
    windowSpy.mockRestore();
  });
});
