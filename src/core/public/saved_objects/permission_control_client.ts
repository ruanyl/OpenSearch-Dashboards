/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PublicMethodsOf } from '@osd/utility-types';

import { HttpSetup } from '../http';

const API_BASE_URL = '/api/saved_objects_permission_control';

export type PermissionControlClientContract = PublicMethodsOf<PermissionControlClient>;

export class PermissionControlClient {
  private http: HttpSetup;

  constructor(http: HttpSetup) {
    this.http = http;
  }

  public async status() {
    return this.http.fetch(`${API_BASE_URL}/status`);
  }
}
