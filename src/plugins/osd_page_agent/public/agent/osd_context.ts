/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OSD Context Provider — gathers OSD-specific metadata for prompt injection.
 *
 * This is a NEW file with no page-agent equivalent. It reads the current
 * OSD application state (app ID, workspace, index pattern, query, time range,
 * filters) from core and data plugin services and returns a structured
 * OsdContext object that gets injected into the LLM prompt.
 */

import { CoreStart } from 'opensearch-dashboards/public';
import { DataPublicPluginStart } from '../../../data/public';
import { OsdContext } from '../../common/types';

export class OsdContextProvider {
  private currentAppId = 'unknown';

  constructor(
    private readonly core: CoreStart,
    private readonly dataPlugin: DataPublicPluginStart
  ) {
    // Subscribe to currentAppId$ observable to track the active app
    this.core.application.currentAppId$.subscribe((appId: string | undefined) => {
      this.currentAppId = appId || 'unknown';
    });
  }

  getContext(): OsdContext {
    // Get workspace name (if workspaces service available)
    const workspaceName = (this.core as any).workspaces?.currentWorkspace$?.getValue?.()?.name;

    // Get current index pattern from data plugin
    let currentIndexPattern: OsdContext['currentIndexPattern'];
    try {
      // indexPattern.getDefault() is async so we can't await here in a sync method.
      // The value will be populated after first use via the tools or agent loop.
    } catch (_e) {
      /* ignore */
    }

    // Get current query
    let currentQuery: OsdContext['currentQuery'];
    try {
      const query = this.dataPlugin.query.queryString.getQuery();
      if (query) {
        currentQuery = {
          query: typeof query.query === 'string' ? query.query : JSON.stringify(query.query),
          language: query.language,
        };
      }
    } catch (_e) {
      /* ignore */
    }

    // Get current time range
    let currentTimeRange: OsdContext['currentTimeRange'];
    try {
      const timeRange = this.dataPlugin.query.timefilter.timefilter.getTime();
      if (timeRange) {
        currentTimeRange = { from: timeRange.from, to: timeRange.to };
      }
    } catch (_e) {
      /* ignore */
    }

    // Get applied filters
    let appliedFilters: OsdContext['appliedFilters'];
    try {
      const filters = this.dataPlugin.query.filterManager.getFilters();
      if (filters && filters.length > 0) {
        appliedFilters = filters.map((f: any) => ({
          field: f.meta?.key || 'unknown',
          value: f.meta?.value || JSON.stringify(f.query || f),
        }));
      }
    } catch (_e) {
      /* ignore */
    }

    return {
      currentAppId: this.currentAppId,
      workspaceName,
      currentIndexPattern,
      currentQuery,
      currentTimeRange,
      appliedFilters,
    };
  }
}
