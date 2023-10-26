/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpServerMock } from '../../../core/server/mocks';
import { generateRandomId, getPrincipalsFromRequest } from './utils';

describe('workspace utils', () => {
  it('should generate id with the specified size', () => {
    expect(generateRandomId(6)).toHaveLength(6);
  });

  it('should generate random IDs', () => {
    const NUM_OF_ID = 10000;
    const ids = new Set<string>();
    for (let i = 0; i < NUM_OF_ID; i++) {
      ids.add(generateRandomId(6));
    }
    expect(ids.size).toBe(NUM_OF_ID);
  });

  it('should return empty map when request do not have authentication', () => {
    const mockRequest = httpServerMock.createOpenSearchDashboardsRequest();
    const result = getPrincipalsFromRequest(mockRequest);
    expect(result).toEqual({});
  });

  it('should return normally when request has authentication', () => {
    const mockRequest = httpServerMock.createOpenSearchDashboardsRequest({
      auth: {
        credentials: {
          authInfo: {
            backend_roles: ['foo'],
            user_name: 'bar',
          },
        },
      } as any,
    });
    const result = getPrincipalsFromRequest(mockRequest);
    expect(result.users).toEqual(['bar']);
    expect(result.groups).toEqual(['foo']);
  });

  it('should return a fake user when there is auth field but no backend_roles or user name', () => {
    const mockRequest = httpServerMock.createOpenSearchDashboardsRequest({
      auth: {
        credentials: {
          authInfo: {},
        },
      } as any,
    });
    const result = getPrincipalsFromRequest(mockRequest);
    expect(result.users?.[0].startsWith('_user_fake_')).toEqual(true);
    expect(result.groups).toEqual(undefined);
  });
});
