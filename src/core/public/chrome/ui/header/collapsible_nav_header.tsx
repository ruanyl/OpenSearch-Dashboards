/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import useObservable from 'react-use/lib/useObservable';
import {
  EuiContextMenu,
  EuiPopover,
  EuiIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiCollapsibleNavGroup,
} from '@elastic/eui';
import {
  HttpStart,
  WorkspaceStart,
  WorkspaceAttribute,
  MANAGEMENT_WORKSPACE,
} from '../../../../public';
import { InternalApplicationStart } from '../../../application';
import { formatUrlWithWorkspaceId } from '../../../utils';
import {
  WORKSPACE_CREATE_APP_ID,
  WORKSPACE_LIST_APP_ID,
  WORKSPACE_OVERVIEW_APP_ID,
} from '../../constants';

interface Props {
  workspaces: WorkspaceStart;
  basePath: HttpStart['basePath'];
  getUrlForApp: InternalApplicationStart['getUrlForApp'];
}

function getFilteredWorkspaceList(
  workspaces: WorkspaceStart,
  workspaceList: WorkspaceAttribute[],
  currentWorkspace: WorkspaceAttribute | null
): WorkspaceAttribute[] {
  // list top5 workspaces except management workspace
  let filteredWorkspaceList = workspaceList
    .filter((workspace) => workspace.id !== MANAGEMENT_WORKSPACE)
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

export function CollapsibleNavHeader({ workspaces, getUrlForApp, basePath }: Props) {
  const workspaceEnabled = useObservable(workspaces.workspaceEnabled$, false);
  const workspaceList = useObservable(workspaces.workspaceList$, []);
  const currentWorkspace = useObservable(workspaces.currentWorkspace$, null);
  const filteredWorkspaceList = getFilteredWorkspaceList(
    workspaces,
    workspaceList,
    currentWorkspace
  );
  const currentWorkspaceName = currentWorkspace?.name ?? 'OpenSearch Analytics';
  const [isPopoverOpen, setPopover] = useState(false);

  if (!workspaceEnabled) {
    const defaultHeaderName = 'OpenSearch Analytics';
    return (
      <EuiCollapsibleNavGroup>
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiIcon type="logoOpenSearch" size="l" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText style={{ fontWeight: 'bold' }}>{defaultHeaderName}</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiCollapsibleNavGroup>
    );
  }
  const onButtonClick = () => {
    setPopover(!isPopoverOpen);
  };

  const closePopover = () => {
    setPopover(false);
  };

  const workspaceToItem = (workspace: WorkspaceAttribute, index: number) => {
    const href = formatUrlWithWorkspaceId(
      getUrlForApp(WORKSPACE_OVERVIEW_APP_ID, {
        absolute: false,
      }),
      workspace.id,
      basePath
    );
    const name =
      currentWorkspace !== null && index === 0 ? (
        <EuiText style={{ fontWeight: 'bold' }}>{workspace.name}</EuiText>
      ) : (
        workspace.name
      );
    return {
      href,
      name,
      key: index.toString(),
      icon: <EuiIcon type="stopFilled" color={workspace.color ?? 'primary'} />,
    };
  };

  const getWorkspaceListItems = () => {
    const workspaceListItems = filteredWorkspaceList.map((workspace, index) =>
      workspaceToItem(workspace, index)
    );
    const length = workspaceListItems.length;
    workspaceListItems.push({
      icon: <EuiIcon type="plus" />,
      name: 'Create workspaces',
      key: length.toString(),
      href: formatUrlWithWorkspaceId(
        getUrlForApp(WORKSPACE_CREATE_APP_ID, {
          absolute: false,
        }),
        currentWorkspace?.id ?? '',
        basePath
      ),
    });
    workspaceListItems.push({
      icon: <EuiIcon type="folderClosed" />,
      name: 'All workspaces',
      key: (length + 1).toString(),
      href: formatUrlWithWorkspaceId(
        getUrlForApp(WORKSPACE_LIST_APP_ID, {
          absolute: false,
        }),
        currentWorkspace?.id ?? '',
        basePath
      ),
    });
    return workspaceListItems;
  };

  const currentWorkspaceButton = (
    <EuiCollapsibleNavGroup>
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiIcon type="logoOpenSearch" size="l" />
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
        <EuiIcon type="logoOpenSearch" size="l" />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiText style={{ fontWeight: 'bold' }}>{currentWorkspaceName}</EuiText>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiIcon type="cross" onClick={closePopover} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  const panels = [
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
          href: formatUrlWithWorkspaceId(
            getUrlForApp(WORKSPACE_OVERVIEW_APP_ID, {
              absolute: false,
            }),
            'management',
            basePath
          ),
        },
      ],
    },
    {
      id: 1,
      title: 'Workspaces',
      items: getWorkspaceListItems(),
    },
  ];

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
