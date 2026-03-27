/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OSD-specific tools for the page agent.
 *
 * This is a NEW file with no page-agent equivalent. These tools give the
 * agent programmatic shortcuts to common OSD operations — bypassing DOM
 * interaction for speed and reliability. Each tool follows the PageAgentTool
 * interface: description, JSON Schema inputSchema, and an async execute
 * function that returns a string result.
 *
 * All tools catch errors internally and return descriptive messages without
 * throwing, so a failed tool call never terminates the agent loop.
 */

import { CoreStart } from 'opensearch-dashboards/public';
import { DataPublicPluginStart } from '../../../data/public';
import { PageAgentTool } from '../../common/types';
import { OsdContextProvider } from './osd_context';

export function createOsdTools(
  core: CoreStart,
  dataPlugin: DataPublicPluginStart,
  osdContext: OsdContextProvider
): Map<string, PageAgentTool> {
  const tools = new Map<string, PageAgentTool>();

  // -------------------------------------------------------------------------
  // run_query — execute OpenSearch query via Dev Tools console proxy
  // -------------------------------------------------------------------------
  tools.set('run_query', {
    description:
      'Execute an OpenSearch query via the Dev Tools console proxy. Use for DSL or PPL queries.',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
        path: { type: 'string', description: 'OpenSearch API path, e.g. /my-index/_search' },
        body: { type: 'string', description: 'Request body as JSON string (optional)' },
      },
      required: ['method', 'path'],
    },
    execute: async (args: { method: string; path: string; body?: string }) => {
      try {
        const response = await core.http.post('/api/console/proxy', {
          query: { path: args.path, method: args.method },
          body: args.body || undefined,
        });
        return `✅ Query executed. Response: ${JSON.stringify(response).substring(0, 2000)}`;
      } catch (e: any) {
        return `❌ Query failed: ${e.message || e}`;
      }
    },
  });

  // -------------------------------------------------------------------------
  // get_index_patterns — retrieve available index patterns
  // -------------------------------------------------------------------------
  tools.set('get_index_patterns', {
    description: 'Get the list of available index patterns.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      try {
        const savedObjects = await core.savedObjects.client.find({
          type: 'index-pattern',
          perPage: 100,
        });
        const patterns = savedObjects.savedObjects.map((so: any) => ({
          id: so.id,
          title: so.attributes.title,
          timeField: so.attributes.timeFieldName,
        }));
        return `✅ Found ${patterns.length} index patterns: ${JSON.stringify(patterns)}`;
      } catch (e: any) {
        return `❌ Failed to get index patterns: ${e.message || e}`;
      }
    },
  });

  // -------------------------------------------------------------------------
  // navigate_to_app — navigate to a specific OSD application
  // -------------------------------------------------------------------------
  tools.set('navigate_to_app', {
    description:
      'Navigate to a specific OSD application (e.g., explore, dashboards, dev_tools, visualize, management).',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Application ID to navigate to' },
      },
      required: ['appId'],
    },
    execute: async (args: { appId: string }) => {
      try {
        await core.application.navigateToApp(args.appId);
        return `✅ Navigated to ${args.appId}`;
      } catch (e: any) {
        return `❌ Failed to navigate to ${args.appId}: ${e.message || e}`;
      }
    },
  });

  // -------------------------------------------------------------------------
  // get_saved_objects — search saved objects by type
  // -------------------------------------------------------------------------
  tools.set('get_saved_objects', {
    description:
      'Search saved objects by type (dashboard, visualization, index-pattern, search) and optional search string.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Saved object type' },
        search: { type: 'string', description: 'Optional search string' },
      },
      required: ['type'],
    },
    execute: async (args: { type: string; search?: string }) => {
      try {
        const result = await core.savedObjects.client.find({
          type: args.type,
          search: args.search,
          perPage: 50,
        });
        const objects = result.savedObjects.map((so: any) => ({
          id: so.id,
          type: so.type,
          title: so.attributes.title || so.attributes.name || so.id,
        }));
        return `✅ Found ${objects.length} saved objects: ${JSON.stringify(objects)}`;
      } catch (e: any) {
        return `❌ Failed to search saved objects: ${e.message || e}`;
      }
    },
  });

  // -------------------------------------------------------------------------
  // set_time_range — set the global time range filter
  // -------------------------------------------------------------------------
  tools.set('set_time_range', {
    description: 'Set the global time range filter (e.g., from "now-15m" to "now").',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start time (e.g., "now-15m", "2024-01-01")' },
        to: { type: 'string', description: 'End time (e.g., "now", "2024-01-31")' },
      },
      required: ['from', 'to'],
    },
    execute: async (args: { from: string; to: string }) => {
      try {
        dataPlugin.query.timefilter.timefilter.setTime({ from: args.from, to: args.to });
        return `✅ Time range set to ${args.from} — ${args.to}`;
      } catch (e: any) {
        return `❌ Failed to set time range: ${e.message || e}`;
      }
    },
  });

  // Note: set_query is NOT a built-in tool. Query execution in specific apps
  // (e.g., Explore) is handled by plugin-registered tools via AssistantActionService.
  // For example, Explore registers `execute_ppl_query` which updates the editor,
  // executes the query via Redux, and waits for results.

  // -------------------------------------------------------------------------
  // get_current_app_state — get structured OSD state metadata
  // -------------------------------------------------------------------------
  tools.set('get_current_app_state', {
    description:
      'Get structured metadata about the current OSD state (app ID, index pattern, query, time range, filters).',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      try {
        const context = osdContext.getContext();
        return `✅ Current state: ${JSON.stringify(context)}`;
      } catch (e: any) {
        return `❌ Failed to get app state: ${e.message || e}`;
      }
    },
  });

  return tools;
}
