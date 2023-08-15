/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BehaviorSubject } from 'rxjs';
import { WorkspaceAttribute } from '../workspace';

const currentWorkspaceId$ = new BehaviorSubject<string>('');
const workspaceList$ = new BehaviorSubject<WorkspaceAttribute[]>([]);
const currentWorkspace$ = new BehaviorSubject<WorkspaceAttribute | null>(null);
const hasFetchedWorkspaceList$ = new BehaviorSubject<boolean>(false);

const createWorkspacesSetupContractMock = () => ({
  currentWorkspaceId$,
  workspaceList$,
  currentWorkspace$,
  hasFetchedWorkspaceList$,
});

const createWorkspacesStartContractMock = createWorkspacesSetupContractMock;

export const workspacesServiceMock = {
  createSetupContractMock: createWorkspacesStartContractMock,
  createStartContract: createWorkspacesStartContractMock,
};
