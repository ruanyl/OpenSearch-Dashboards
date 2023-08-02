/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { I18nProvider } from '@osd/i18n/react';
import { i18n } from '@osd/i18n';
import { useOpenSearchDashboards } from '../../../opensearch_dashboards_react/public';
import { WorkspaceUpdater } from './workspace_updater';

export const WorkspaceUpdaterApp = ({ appBasePath }: { appBasePath: string }) => {
  const {
    services: { chrome },
  } = useOpenSearchDashboards();

  /**
   * set breadcrumbs to chrome
   */
  useEffect(() => {
    chrome?.setBreadcrumbs([
      {
        href: appBasePath,
        text: i18n.translate('workspace.workspaceUpdateTitle', {
          defaultMessage: 'Workspace Update',
        }),
      },
    ]);
  }, [appBasePath, chrome]);

  return (
    <I18nProvider>
      <WorkspaceUpdater />
    </I18nProvider>
  );
};
