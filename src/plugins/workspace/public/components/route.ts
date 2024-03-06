/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PATHS } from '../../common/constants';

import { WorkspaceList } from './workspace_list';

export interface RouteConfig {
  path: string;
  Component: React.ComponentType<any>;
  label: string;
  exact?: boolean;
}

export const ROUTES: RouteConfig[] = [
  {
    path: PATHS.list,
    Component: WorkspaceList,
    label: 'List',
  },
];
