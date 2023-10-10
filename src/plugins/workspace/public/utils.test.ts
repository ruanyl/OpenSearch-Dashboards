/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpServiceMock } from '../../../core/public/mocks';
import { formatUrlWithWorkspaceId } from './utils';

const basePathWithoutWorkspaceBasePath = httpServiceMock.createSetupContract().basePath;

describe('#formatUrlWithWorkspaceId', () => {
  it('return url with workspace prefix when format with a id provided', () => {
    expect(
      formatUrlWithWorkspaceId('/app/dashboard', 'foo', basePathWithoutWorkspaceBasePath)
    ).toEqual('http://localhost/w/foo/app/dashboard');
  });

  it('return url without workspace prefix when format without a id', () => {
    expect(
      formatUrlWithWorkspaceId('/w/foo/app/dashboard', '', basePathWithoutWorkspaceBasePath)
    ).toEqual('http://localhost/app/dashboard');
  });
});
