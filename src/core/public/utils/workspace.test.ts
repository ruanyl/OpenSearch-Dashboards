/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getWorkspaceIdFromUrl } from './workspace';

describe('#getWorkspaceIdFromUrl', () => {
  it('return workspace when there is a match', () => {
    expect(getWorkspaceIdFromUrl('http://localhost/w/foo')).toEqual('foo');
  });

  it('return empty when there is not a match', () => {
    expect(getWorkspaceIdFromUrl('http://localhost/w2/foo')).toEqual('');
  });
});
