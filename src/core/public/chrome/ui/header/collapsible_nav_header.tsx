/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { WorkspaceAttribute } from 'opensearch-dashboards/public';
import { EuiButton, EuiContextMenu, EuiPopover } from '@elastic/eui';
import useObservable from 'react-use/lib/useObservable';
import { WorkspaceStart } from 'opensearch-dashboards/public';
import { InternalApplicationStart } from '../../../application';
import { formatUrlWithWorkspaceId } from '../../../utils';

interface Props {
  workspaces: WorkspaceStart;
  getUrlForApp: InternalApplicationStart['getUrlForApp'];
}

function getfilteredWorkspaceList(
  workspaces: WorkspaceStart,
  workspaceList: WorkspaceAttribute[],
  currentWorkspace: WorkspaceAttribute | null
): WorkspaceAttribute[] {
  let filteredWorkspaceList = workspaceList.slice(0, 5);
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
  const filteredWorkspaceList = getfilteredWorkspaceList(
    workspaces,
    workspaceList,
    currentWorkspace
  );
  const title =
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

  const workspaceToItem = (workspace: WorkspaceAttribute) => {
    const href = formatUrlWithWorkspaceId(
      getUrlForApp(workspaceOverviewAppId, {
        absolute: false,
      }),
      workspace.id
    );
    return {
      href,
      key: workspace.id,
      name: workspace.name,
    };
  };

  const panels = [
    {
      id: 0,
      title,
      items: [
        {
          name: 'Workspaces',
          icon: 'folderClosed',
          panel: 1,
        },
        {
          name: 'Management',
          icon: 'folderClosed',
        },
      ],
    },
    {
      id: 1,
      title: 'Workspaces',
      items: filteredWorkspaceList.map(workspaceToItem),
    },
  ];

  const button = (
    <EuiButton iconType="arrowDown" iconSide="right" onClick={onButtonClick}>
      {title}
    </EuiButton>
  );

  return (
    <EuiPopover
      id="contextMenuExample"
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downLeft"
    >
      <EuiContextMenu initialPanelId={0} panels={panels} />
    </EuiPopover>
  );
}
