/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Plugin,
  CoreSetup,
  CoreStart,
  PluginInitializerContext,
} from 'opensearch-dashboards/public';
import { DataPublicPluginStart } from '../../data/public';
import { PLUGIN_ID } from '../common';
import { PageAgentCore } from './agent/page_agent_core';
import { PageController } from './agent/page_controller';
import { OsdContextProvider } from './agent/osd_context';
import { createOsdTools } from './agent/osd_tools';
import { patchReact } from './agent/dom/patches';
import { mountAgentPanelButton } from './components/agent_panel';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OsdPageAgentSetupDeps {}

export interface OsdPageAgentStartDeps {
  data: DataPublicPluginStart;
}

export class OsdPageAgentPlugin
  implements Plugin<void, void, OsdPageAgentSetupDeps, OsdPageAgentStartDeps> {
  private agentCore?: PageAgentCore;

  constructor(private readonly initializerContext: PluginInitializerContext) {}

  public setup(core: CoreSetup): void {}

  public async start(core: CoreStart, plugins: OsdPageAgentStartDeps): Promise<void> {
    // Fetch safe config (modelId, maxSteps) from server
    let serverConfig: { enabled: boolean; modelId: string; maxSteps: number };
    try {
      serverConfig = await core.http.get('/api/osd_page_agent/config');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[${PLUGIN_ID}] Failed to fetch config from server, using defaults.`, e);
      serverConfig = { enabled: true, modelId: 'unknown', maxSteps: 40 };
    }

    // Patch React root elements to avoid false-positive interactivity detection
    patchReact();

    // Create OSD context provider
    const osdContext = new OsdContextProvider(core, plugins.data);

    // Create PageController for DOM extraction and actions
    const pageController = new PageController();

    // Create PageAgentCore — the agent loop engine
    this.agentCore = new PageAgentCore(
      {
        modelId: serverConfig.modelId,
        maxSteps: serverConfig.maxSteps,
      },
      pageController,
      core.http,
      osdContext
    );

    // Register OSD-specific tools
    const osdTools = createOsdTools(core, plugins.data, osdContext);
    for (const [name, tool] of osdTools) {
      this.agentCore.tools.set(name, tool);
    }

    // Register Agent Panel header button
    core.chrome.navControls.registerRight({
      order: 2000,
      mount: mountAgentPanelButton(this.agentCore),
    });

    // eslint-disable-next-line no-console
    console.log(
      `[${PLUGIN_ID}] Plugin started (model: ${serverConfig.modelId}, maxSteps: ${serverConfig.maxSteps})`
    );
  }

  public stop() {
    if (this.agentCore) {
      this.agentCore.dispose();
    }
  }
}
