/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { WorkspaceAttribute, WorkspacesStart } from 'opensearch-dashboards/public';
import { EuiButton, EuiContextMenu, EuiPopover } from '@elastic/eui';
import useObservable from 'react-use/lib/useObservable';
import { WORKSPACE_OVERVIEW_APP_ID } from '../../constants';
import { InternalApplicationStart } from '../../../application';

interface Props {
  workspaces: WorkspacesStart;
  getUrlForApp: InternalApplicationStart['getUrlForApp'];
}
function getfilteredWorkspaceList(
  workspaces: WorkspacesStart,
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
  const workspaceList = useObservable(workspaces.client.workspaceList$, []);
  const currentWorkspace = useObservable(workspaces.client.currentWorkspace$, null);
  const filteredWorkspaceList = getfilteredWorkspaceList(
    workspaces,
    workspaceList,
    currentWorkspace
  );
  const title = filteredWorkspaceList.length
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
    const href = workspaces?.formatUrlWithWorkspaceId(
      getUrlForApp(WORKSPACE_OVERVIEW_APP_ID, {
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
