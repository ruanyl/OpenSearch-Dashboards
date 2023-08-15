/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { WorkspaceAttribute } from 'opensearch-dashboards/public';
import {
  EuiContextMenu,
  EuiPopover,
  EuiIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiCollapsibleNavGroup,
} from '@elastic/eui';
import useObservable from 'react-use/lib/useObservable';
import { WorkspaceStart } from 'opensearch-dashboards/public';
import { InternalApplicationStart } from '../../../application';
import { formatUrlWithWorkspaceId } from '../../../utils';

interface Props {
  workspaces: WorkspaceStart;
  getUrlForApp: InternalApplicationStart['getUrlForApp'];
}

function getFilteredWorkspaceList(
  workspaces: WorkspaceStart,
  workspaceList: WorkspaceAttribute[],
  currentWorkspace: WorkspaceAttribute | null
): WorkspaceAttribute[] {
  // show top5 workspaces except management workspace
  let filteredWorkspaceList = workspaceList
    .filter((workspace) => workspace.name !== 'Management')
    .slice(0, 5);
  if (currentWorkspace) {
    // current workspace located at the top of workspace list
    filteredWorkspaceList = filteredWorkspaceList.filter(
      (workspace) => workspace.id !== currentWorkspace.id
    );
    filteredWorkspaceList.unshift(currentWorkspace);
    if (filteredWorkspaceList.length > 5) {
      filteredWorkspaceList.pop();
    }
  }
  return filteredWorkspaceList;
}

export function CollapsibleNavHeader({ workspaces, getUrlForApp }: Props) {
  const workspaceOverviewAppId = 'workspace_overview';
  const workspaceList = useObservable(workspaces.workspaceList$, []);
  const currentWorkspace = useObservable(workspaces.currentWorkspace$, null);
  const workspaceEnabled = useObservable(workspaces.workspaceEnabled$, false);
  const filteredWorkspaceList = getFilteredWorkspaceList(
    workspaces,
    workspaceList,
    currentWorkspace
  );
  const currentWorkspaceName =
    workspaceEnabled && filteredWorkspaceList.length
      ? filteredWorkspaceList[0].name
      : 'OpenSearch Analytics';
  const [isPopoverOpen, setPopover] = useState(false);
  const onButtonClick = () => {
    setPopover(!isPopoverOpen);
  };

  const closePopover = () => {
    setPopover(false);
  };

  const workspaceToItem = (workspace: WorkspaceAttribute, workspaceNameBolded: boolean) => {
    const href = formatUrlWithWorkspaceId(
      getUrlForApp(workspaceOverviewAppId, {
        absolute: false,
      }),
      workspace.id
    );
    const name = workspaceNameBolded ? (
      <EuiText style={{ fontWeight: 'bold' }}>{workspace.name}</EuiText>
    ) : (
      workspace.name
    );
    return {
      href,
      name,
      key: workspace.id,
      icon: <EuiIcon type="stopFilled" color={workspace.color ?? 'primary'} />,
    };
  };

  const currentWorkspaceButton = (
    <EuiCollapsibleNavGroup>
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiIcon type="logoOpenSearch" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText style={{ fontWeight: 'bold' }}>{currentWorkspaceName}</EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiIcon type="arrowDown" onClick={onButtonClick} />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiCollapsibleNavGroup>
  );

  const currentWorkspaceTitle = (
    <EuiFlexGroup>
      <EuiFlexItem>
        <EuiIcon type="logoOpenSearch" />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiText style={{ fontWeight: 'bold' }}>{currentWorkspaceName}</EuiText>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiIcon type="cross" onClick={closePopover} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  const panels = workspaceEnabled
    ? [
        {
          id: 0,
          title: currentWorkspaceTitle,
          items: [
            {
              name: <EuiText style={{ fontWeight: 'bold' }}>{'Workspaces'}</EuiText>,
              icon: 'folderClosed',
              panel: 1,
            },
            {
              name: 'Management',
              icon: 'managementApp',
            },
          ],
        },
        {
          id: 1,
          title: 'Workspaces',
          items: filteredWorkspaceList.map((workspace, index) =>
            workspaceToItem(workspace, index === 0)
          ),
        },
      ]
    : [];

  return (
    <EuiPopover
      id="contextMenuExample"
      button={currentWorkspaceButton}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downLeft"
    >
      <EuiContextMenu initialPanelId={0} panels={panels} />
    </EuiPopover>
  );
}
