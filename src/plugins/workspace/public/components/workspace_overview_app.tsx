/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { I18nProvider } from '@osd/i18n/react';
import { i18n } from '@osd/i18n';
import { useOpenSearchDashboards } from '../../../opensearch_dashboards_react/public';
import { WorkspaceOverview } from './workspace_overview';

export const WorkspaceOverviewApp = ({ appBasePath }: { appBasePath: string }) => {
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
        text: i18n.translate('workspace.workspaceOverviewTitle', {
          defaultMessage: 'Workspace Overview',
        }),
      },
    ]);
  }, [appBasePath, chrome]);

  return (
    <I18nProvider>
      <WorkspaceOverview />
    </I18nProvider>
  );
};
