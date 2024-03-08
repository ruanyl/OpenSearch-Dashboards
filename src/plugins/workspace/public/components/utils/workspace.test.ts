/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { switchWorkspace, updateWorkspace } from './workspace';
import { formatUrlWithWorkspaceId } from '../../../../../core/public/utils';
jest.mock('../../../../../core/public/utils');

import { coreMock } from '../../../../../core/public/mocks';

const coreStartMock = coreMock.createStart();

window = Object.create(window);
const defaultUrl = 'localhost://';

describe('workspace utils', () => {
  describe('switchWorkspace', () => {
    it('should redirect if newUrl is returned', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: defaultUrl,
        },
        writable: true,
      });
      // @ts-ignore
      formatUrlWithWorkspaceId.mockImplementation(() => 'new_url');
      switchWorkspace({ application: coreStartMock.application, http: coreStartMock.http }, '');
      expect(window.location.href).toEqual('new_url');
    });

    it('should not redirect if newUrl is not returned', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: defaultUrl,
        },
        writable: true,
      });
      // @ts-ignore
      formatUrlWithWorkspaceId.mockImplementation(() => '');
      switchWorkspace({ application: coreStartMock.application, http: coreStartMock.http }, '');
      expect(window.location.href).toEqual(defaultUrl);
    });
  });

  describe('updateWorkspace', () => {
    it('should redirect if newUrl is returned', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: defaultUrl,
        },
        writable: true,
      });
      // @ts-ignore
      formatUrlWithWorkspaceId.mockImplementation(() => 'new_url');
      updateWorkspace({ application: coreStartMock.application, http: coreStartMock.http }, '');
      expect(window.location.href).toEqual('new_url');
    });

    it('should not redirect if newUrl is not returned', () => {
      Object.defineProperty(window, 'location', {
        value: {
          href: defaultUrl,
        },
        writable: true,
      });
      // @ts-ignore
      formatUrlWithWorkspaceId.mockImplementation(() => '');
      updateWorkspace({ application: coreStartMock.application, http: coreStartMock.http }, '');
      expect(window.location.href).toEqual(defaultUrl);
    });
  });
});
