/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApplicationStart, HttpSetup, WorkspaceObservables } from '../../../core/public';
import React from 'react';
import { WorkspaceMenu } from './components/workspace_menu/workspace_menu';

export function renderWorkspaceMenu({
  basePath,
  getUrlForApp,
  observables,
}: {
  getUrlForApp: ApplicationStart['getUrlForApp'];
  basePath: HttpSetup['basePath'];
  observables: WorkspaceObservables;
}) {
  return (
    <WorkspaceMenu basePath={basePath} getUrlForApp={getUrlForApp} observables={observables} />
  );
}
