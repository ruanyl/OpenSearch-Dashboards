/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type WorkspacePermissionItem<T extends string> = {
  modes: T[];
} & ({ type: 'user'; userId: string } | { type: 'group'; group: string });
