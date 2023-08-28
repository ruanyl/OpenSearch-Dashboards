/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpServiceMock } from '../http/http_service.mock';
import { PermissionControlClient } from './permission_control_client';

describe('PermissionControlClient', () => {
  const http = httpServiceMock.createStartContract();
  let permissionControlClient: PermissionControlClient;

  beforeEach(() => {
    permissionControlClient = new PermissionControlClient(http);
    http.fetch.mockClear();
  });

  test('returns permission control status', () => {
    http.fetch.mockResolvedValue({ enabled: true });
    expect(permissionControlClient.status()).resolves.toEqual({ enabled: true });
  });

  test('rejects when HTTP call fails', () => {
    http.fetch.mockRejectedValue(new Error('Request failed'));
    return expect(permissionControlClient.status()).rejects.toMatchInlineSnapshot(
      `[Error: Request failed]`
    );
  });
});
