/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { WorkspaceCreator } from './workspace_creator';
import { PublicAppInfo } from 'opensearch-dashboards/public';
import { fireEvent, render, waitFor } from '@testing-library/react';
import * as opensearchReactExports from '../../../../opensearch_dashboards_react/public';
import { BehaviorSubject } from 'rxjs';
import { WorkspaceFormSubmitData } from './workspace_form';

jest.mock('../../../../opensearch_dashboards_react/public', () => ({
  ...jest.requireActual('../../../../opensearch_dashboards_react/public'),
  __esModule: true,
}));

const workspaceClientCreate = jest
  .fn()
  .mockReturnValue({ result: { id: 'successResult' }, success: true });

const navigateToApp = jest.fn();
const notificationToastsAddSuccess = jest.fn();
const notificationToastsAddDanger = jest.fn();
const PublicAPPInfoMap = new Map([
  ['app1', { id: 'app1', title: 'app1' }],
  ['app2', { id: 'app2', title: 'app2', category: { id: 'category1', label: 'category1' } }],
  ['app3', { id: 'app3', category: { id: 'category1', label: 'category1' } }],
  ['app4', { id: 'app4', category: { id: 'category2', label: 'category2' } }],
  ['app5', { id: 'app5', category: { id: 'category2', label: 'category2' } }],
]);

jest.spyOn(opensearchReactExports, 'useOpenSearchDashboards').mockReturnValue({
  services: {
    application: {
      navigateToApp,
      getUrlForApp: jest.fn(),
      applications$: new BehaviorSubject<Map<string, PublicAppInfo>>(PublicAPPInfoMap as any),
    },
    http: {
      basePath: {
        remove: jest.fn(),
        prepend: jest.fn(),
      },
    },
    notifications: {
      toasts: {
        addDanger: notificationToastsAddDanger,
        addSuccess: notificationToastsAddSuccess,
      },
    },
    workspaceClient: {
      create: workspaceClientCreate,
    },
  },
});

function clearMockedFunctions() {
  workspaceClientCreate.mockClear();
  notificationToastsAddDanger.mockClear();
  notificationToastsAddSuccess.mockClear();
}

describe('WorkspaceCreator', () => {
  it('cannot create workspace when name empty', async () => {
    const { getByTestId } = render(<WorkspaceCreator />);
    fireEvent.click(getByTestId('workspaceForm-bottomBar-createButton'));
    expect(workspaceClientCreate).not.toHaveBeenCalled();
  });

  it('cancel create workspace', async () => {
    const { findByText, getByTestId } = render(<WorkspaceCreator />);
    fireEvent.click(getByTestId('workspaceForm-bottomBar-cancelButton'));
    await findByText('Discard changes?');
    fireEvent.click(getByTestId('confirmModalConfirmButton'));
    expect(navigateToApp).toHaveBeenCalled();
  });

  it('create workspace with detailed information', async () => {
    clearMockedFunctions();
    const { getByTestId } = render(<WorkspaceCreator />);
    const nameInput = getByTestId('workspaceForm-workspaceDetails-nameInputText');
    fireEvent.input(nameInput, {
      target: { value: 'test workspace name' },
    });
    const descriptionInput = getByTestId('workspaceForm-workspaceDetails-descriptionInputText');
    fireEvent.input(descriptionInput, {
      target: { value: 'test workspace description' },
    });
    const colorSelector = getByTestId(
      'euiColorPickerAnchor workspaceForm-workspaceDetails-colorPicker'
    );
    fireEvent.input(colorSelector, {
      target: { value: '#000000' },
    });
    const iconSelector = getByTestId('workspaceForm-workspaceDetails-iconSelector');
    fireEvent.click(iconSelector);
    fireEvent.click(getByTestId('workspaceForm-workspaceDetails-iconSelector-Glasses'));
    const defaultVISThemeSelector = getByTestId(
      'workspaceForm-workspaceDetails-defaultVISThemeSelector'
    );
    fireEvent.click(defaultVISThemeSelector);
    fireEvent.change(defaultVISThemeSelector, { target: { value: 'categorical' } });
    fireEvent.click(getByTestId('workspaceForm-bottomBar-createButton'));
    expect(workspaceClientCreate).toHaveBeenCalled();
    const workspaceCreateProps: WorkspaceFormSubmitData = workspaceClientCreate.mock.calls[0][0];
    expect(workspaceCreateProps.name).toBe('test workspace name');
    expect(workspaceCreateProps.icon).toBe('Glasses');
    expect(workspaceCreateProps.color).toBe('#000000');
    expect(workspaceCreateProps.description).toBe('test workspace description');
    expect(workspaceCreateProps.defaultVISTheme).toBe('categorical');
    await waitFor(() => {
      expect(notificationToastsAddSuccess).toHaveBeenCalled();
    });
    expect(notificationToastsAddDanger).not.toHaveBeenCalled();
  });

  it('create workspace with customized features', async () => {
    clearMockedFunctions();
    const { getByTestId, getByText } = render(<WorkspaceCreator />);
    const nameInput = getByTestId('workspaceForm-workspaceDetails-nameInputText');
    fireEvent.input(nameInput, {
      target: { value: 'test workspace name' },
    });
    fireEvent.click(getByTestId('workspaceForm-workspaceFeatureVisibility-app1'));
    expect(document.body).toMatchSnapshot();
    fireEvent.click(getByText('category1 (0/2)'));
    fireEvent.click(getByTestId('workspaceForm-bottomBar-createButton'));
    expect(workspaceClientCreate).toHaveBeenCalled();
    const workspaceCreateProps: WorkspaceFormSubmitData = workspaceClientCreate.mock.calls[0][0];
    expect(workspaceCreateProps.features).toContain('app1');
    expect(workspaceCreateProps.features).toContain('app2');
    expect(workspaceCreateProps.features).toContain('app3');
    expect(workspaceCreateProps.features).not.toContain('app4');
    expect(workspaceCreateProps.features).not.toContain('app5');
    await waitFor(() => {
      expect(notificationToastsAddSuccess).toHaveBeenCalled();
    });
    expect(notificationToastsAddDanger).not.toHaveBeenCalled();
  });

  it('create workspace with customized permissions', async () => {
    clearMockedFunctions();
    const { getByTestId, getByText } = render(<WorkspaceCreator />);
    const nameInput = getByTestId('workspaceForm-workspaceDetails-nameInputText');
    fireEvent.input(nameInput, {
      target: { value: 'test workspace name' },
    });
    fireEvent.click(getByText('Users & Permissions'));
    fireEvent.click(getByTestId('workspaceForm-permissionSettingPanel-addNew'));
    const userTypeSelection = getByTestId('workspaceForm-permissionSettingPanel-0-userType');
    const userIdInput = getByTestId('workspaceForm-permissionSettingPanel-0-userId');
    fireEvent.change(userTypeSelection, { target: { value: 'user' } });
    fireEvent.change(userIdInput, { target: { value: 'test user id' } });
    fireEvent.click(getByTestId('workspaceForm-bottomBar-createButton'));
    expect(workspaceClientCreate).toHaveBeenCalled();
    const workspaceCreateProps: WorkspaceFormSubmitData = workspaceClientCreate.mock.calls[0][0];
    expect(workspaceCreateProps).toBe({});
  });

  it('create workspace failed ', async () => {
    clearMockedFunctions();
    workspaceClientCreate.mockReturnValue({ result: { id: 'failResult' }, success: false });
    const { getByTestId } = render(<WorkspaceCreator />);
    const nameInput = getByTestId('workspaceForm-workspaceDetails-nameInputText');
    fireEvent.input(nameInput, {
      target: { value: 'test workspace name' },
    });
    fireEvent.click(getByTestId('workspaceForm-bottomBar-createButton'));
    expect(workspaceClientCreate).toHaveBeenCalled();
    await waitFor(() => {
      expect(notificationToastsAddDanger).toHaveBeenCalled();
    });
    expect(notificationToastsAddSuccess).not.toHaveBeenCalled();
  });
});
