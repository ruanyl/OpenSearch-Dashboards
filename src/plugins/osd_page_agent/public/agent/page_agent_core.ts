/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PageAgentCore — AI agent for browser automation inside OpenSearch Dashboards.
 *
 * Adapted from page-agent/packages/core/src/PageAgentCore.ts
 *
 * Modifications:
 * - Removed all @page-agent/* imports — uses local imports
 * - Removed chalk imports — uses plain console.log/console.error
 * - Removed import * as z from 'zod/v4'
 * - Removed import SYSTEM_PROMPT from '...?raw' — imports from './system_prompt'
 * - Removed normalizeResponse import and usage (Anthropic returns parsed input)
 * - Removed experimentalLlmsTxt and fetchLlmsTxt references
 * - Removed experimentalScriptExecutionTool references
 * - Removed transformPageContent references
 * - Removed customSystemPrompt references
 * - Replaced LLM class with BedrockLlmClient (calls server proxy)
 * - Replaced Zod-based #packMacroTool() with JSON Schema version
 * - Added OsdContextProvider for OSD-aware context injection
 * - Added <osd_context> section in #assembleUserPrompt()
 *
 * @remarks
 * ## Re-act Agent Loop
 * - step
 *    - observe (gather information about current environment and context)
 *    - think (LLM calling)
 *      - reflection (evaluate history, generate memory, short-term planning)
 *      - action (give the action to approach the next goal)
 *    - act (execute the action)
 * - loop
 *
 * ## Event System
 * - `statuschange` - Agent status transitions (idle → running → completed/error)
 * - `historychange` - History events updated (persistent, part of agent memory)
 * - `activity` - Real-time activity feedback (transient, for UI only)
 * - `dispose` - Agent cleanup triggered
 *
 * ## Information Streams
 * 1. **History Events** (`history` array)
 *    - Persistent event stream that forms agent's memory
 *    - Included in LLM context across steps
 *    - Types: steps, observations, user takeovers, llm errors
 *
 * 2. **Activity Events** (via `activity` event)
 *    - Transient UI feedback during task execution
 *    - NOT included in LLM context
 *    - Types: thinking, executing, executed, retrying, error
 */

import type { HttpSetup } from 'opensearch-dashboards/public';
import type {
  AgentActivity,
  AgentConfig,
  AgentReflection,
  AgentStatus,
  AgentStepEvent,
  AnthropicToolDefinition,
  BrowserState,
  ExecutionResult,
  HistoricalEvent,
  MacroToolInput,
  PageAgentTool,
} from '../../common/types';
import { BedrockLlmClient, InvokeError } from './llm_client';
import type { OsdContextProvider } from './osd_context';
import type { PageController } from './page_controller';
import { SYSTEM_PROMPT } from './system_prompt';
import { tools as baseTools } from './tools';
import { assert, uid, waitFor } from './utils';
import { AssistantActionService } from '../../../context_provider/public';

export { tool } from './tools';
export type { PageAgentTool } from '../../common/types';

/**
 * AI agent for browser automation inside OpenSearch Dashboards.
 */
export class PageAgentCore extends EventTarget {
  readonly id = uid();
  readonly config: AgentConfig & { maxSteps: number };
  readonly tools: Map<string, PageAgentTool>;
  /** PageController for DOM operations */
  readonly pageController: PageController;

  task = '';
  taskId = '';
  /** History events */
  history: HistoricalEvent[] = [];
  /** Whether this agent has been disposed */
  disposed = false;

  /**
   * Callback for when agent needs user input (ask_user tool)
   * If not set, ask_user tool will be disabled
   * @example onAskUser: (q) => window.prompt(q) || ''
   */
  onAskUser?: (question: string) => Promise<string>;

  private status_: AgentStatus = 'idle';
  private llm: BedrockLlmClient;
  private abortController = new AbortController();
  private observations: string[] = [];
  private osdContext: OsdContextProvider;
  /** Merged tools for the current step (built-in + plugin-registered) */
  private mergedToolsForCurrentStep: Map<string, PageAgentTool> = new Map();

  /** Internal states during a single task execution */
  private states = {
    /** Accumulated wait time in seconds */
    totalWaitTime: 0,
    /** For detecting navigation */
    lastURL: '',
    /** Browser state */
    browserState: null as BrowserState | null,
  };

  constructor(
    config: AgentConfig,
    pageController: PageController,
    http: HttpSetup,
    osdContext: OsdContextProvider
  ) {
    super();

    this.config = { ...config, maxSteps: config.maxSteps ?? 40 };
    this.pageController = pageController;
    this.osdContext = osdContext;

    this.llm = new BedrockLlmClient(http, this.config.maxRetries);
    this.tools = new Map(baseTools);

    // Listen to LLM retry events
    this.llm.addEventListener('retry', (e) => {
      const { attempt, maxAttempts } = (e as CustomEvent).detail;
      this.emitActivity({ type: 'retrying', attempt, maxAttempts });
      // Also push to history for panel rendering
      this.history.push({
        type: 'retry',
        message: `LLM retry attempt ${attempt} of ${maxAttempts}`,
        attempt,
        maxAttempts,
      });
      this.emitHistoryChange();
    });
    this.llm.addEventListener('error', (e) => {
      const error = (e as CustomEvent).detail.error as Error | InvokeError;
      if ((error as any)?.rawError?.name === 'AbortError') return;
      const message = String(error);
      this.emitActivity({ type: 'error', message });
      // Also push to history for panel rendering
      this.history.push({
        type: 'error',
        message,
        rawResponse: (error as InvokeError).rawResponse,
      });
      this.emitHistoryChange();
    });

    if (this.config.customTools) {
      for (const [name, customTool] of Object.entries(this.config.customTools)) {
        if (customTool === null) {
          this.tools.delete(name);
          continue;
        }
        this.tools.set(name, customTool);
      }
    }
  }

  /** Get current agent status */
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  get status(): AgentStatus {
    return this.status_;
  }

  /** Emit statuschange event */
  private emitStatusChange(): void {
    this.dispatchEvent(new Event('statuschange'));
  }

  /** Emit historychange event */
  private emitHistoryChange(): void {
    this.dispatchEvent(new Event('historychange'));
  }

  /**
   * Emit activity event — for transient UI feedback
   */
  private emitActivity(activity: AgentActivity): void {
    this.dispatchEvent(new CustomEvent('activity', { detail: activity }));
  }

  /** Update status and emit event */
  private setStatus(status: AgentStatus): void {
    if (this.status_ !== status) {
      this.status_ = status;
      this.emitStatusChange();
    }
  }

  /**
   * Push an observation message to the history event stream.
   * This will be visible in <agent_history> and remain persistent in memory across steps.
   */
  pushObservation(content: string): void {
    this.observations.push(content);
  }

  /** Stop the current task. Agent remains reusable. */
  stop() {
    this.pageController.cleanUpHighlights();
    this.abortController.abort();
  }

  async execute(task: string): Promise<ExecutionResult> {
    if (this.disposed) throw new Error('PageAgent has been disposed. Create a new instance.');
    if (!task) throw new Error('Task is required');
    this.task = task;
    this.taskId = uid();

    // Disable ask_user tool if onAskUser is not set
    if (!this.onAskUser) {
      this.tools.delete('ask_user');
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = new AbortController();
    }

    this.history = [];
    this.setStatus('running');
    this.emitHistoryChange();
    this.observations = [];

    // Reset internal states
    this.states = { totalWaitTime: 0, lastURL: '', browserState: null };

    let step = 0;

    while (true) {
      try {
        // eslint-disable-next-line no-console
        console.group(`step: ${step}`);

        // observe

        // eslint-disable-next-line no-console
        console.log('👀 Observing...');

        this.states.browserState = await this.pageController.getBrowserState();
        await this.handleObservations(step);

        // assemble prompts

        const messages = [{ role: 'user' as const, content: await this.assembleUserPrompt() }];

        const macroToolDef = this.packMacroTool();

        // invoke LLM

        // eslint-disable-next-line no-console
        console.log('🧠 Thinking...');
        this.emitActivity({ type: 'thinking' });

        const result = await this.llm.invoke(
          messages,
          [macroToolDef],
          'AgentOutput',
          this.abortController.signal,
          { system: this.getSystemPrompt() }
        );

        // parse response — result.toolCall.input is already a parsed object

        let rawInput = result.toolCall.input;
        // eslint-disable-next-line no-console
        console.log('Raw toolCall.input:', JSON.stringify(rawInput));

        // Also handle case where the entire input is a string
        if (typeof rawInput === 'string') {
          try {
            rawInput = JSON.parse(rawInput);
          } catch (_e) {
            /* keep as-is */
          }
        }

        // Handle `action` field returned as a JSON string instead of an object.
        // The LLM sometimes returns:
        //   { evaluation_previous_goal: "...", memory: "...", action: '{"execute_ppl_query": {...}}' }
        // Or double-stringified full MacroTool:
        //   { action: '{"evaluation_previous_goal": "...", "action": {"tool": {}}}' }
        // We need to parse the action string into an object before proceeding.
        if (rawInput.action && typeof rawInput.action === 'string') {
          try {
            const parsed = JSON.parse(rawInput.action);
            if (typeof parsed === 'object' && parsed !== null) {
              // Check if the parsed result is itself a full MacroTool (has its own `action` field)
              // This happens with double-stringification where the entire response is inside `action`
              if (parsed.action && typeof parsed.action === 'object') {
                // Unwrap: use the parsed MacroTool as the new rawInput
                rawInput = parsed;
              } else {
                // Normal case: action was just the tool call as a string
                rawInput.action = parsed;
              }
            }
          } catch (_e) {
            /* keep as-is — will be handled by fallback below */
          }
        }

        // Now extract the MacroTool structure
        let input: MacroToolInput;
        if (rawInput.action && typeof rawInput.action === 'object') {
          input = rawInput as MacroToolInput;
        } else {
          // Try to find a known tool name in the top-level keys
          const knownToolKey = Object.keys(rawInput).find(
            (k) => this.mergedToolsForCurrentStep.has(k) || this.tools.has(k)
          );
          if (knownToolKey) {
            input = {
              evaluation_previous_goal: rawInput.evaluation_previous_goal,
              memory: rawInput.memory,
              next_goal: rawInput.next_goal,
              action: { [knownToolKey]: rawInput[knownToolKey] },
            };
          } else {
            // No recognizable action — fallback to wait (same as page-agent's autoFixer #5)
            // eslint-disable-next-line no-console
            console.warn('[autoFixer] No action found in response, falling back to wait');
            input = {
              evaluation_previous_goal: rawInput.evaluation_previous_goal,
              memory: rawInput.memory,
              next_goal: rawInput.next_goal,
              action: { wait: { seconds: 1 } },
            };
          }
        }

        const reflection: Partial<AgentReflection> = {
          evaluation_previous_goal: input.evaluation_previous_goal,
          memory: input.memory,
          next_goal: input.next_goal,
        };

        // Extract action name from the action object
        const action = input.action;
        let actionName: string;
        let toolInput: any;

        const actionKeys = Object.keys(action);
        const toolKey = actionKeys.find(
          (k) => this.mergedToolsForCurrentStep.has(k) || this.tools.has(k)
        );
        if (toolKey) {
          actionName = toolKey;
          toolInput = action[toolKey];
        } else {
          actionName = actionKeys[0] || 'unknown';
          toolInput = action[actionName];
        }

        // eslint-disable-next-line no-console
        console.log('Parsed action:', actionName, 'input:', toolInput);

        // Build reflection text for logging
        const reflectionLines: string[] = [];
        if (input.evaluation_previous_goal)
          reflectionLines.push(`✅: ${input.evaluation_previous_goal}`);
        if (input.memory) reflectionLines.push(`💾: ${input.memory}`);
        if (input.next_goal) reflectionLines.push(`🎯: ${input.next_goal}`);

        const reflectionText = reflectionLines.length > 0 ? reflectionLines.join('\n') : '';
        if (reflectionText) {
          // eslint-disable-next-line no-console
          console.log(reflectionText);
        }

        // Find the corresponding tool (from merged tools which includes plugin-registered)
        const selectedTool =
          this.mergedToolsForCurrentStep.get(actionName) || this.tools.get(actionName);

        if (!selectedTool) {
          // Tool not found — log available tools for debugging and return error to LLM
          const availableTools = [
            ...Array.from(this.mergedToolsForCurrentStep.keys()),
            ...Array.from(this.tools.keys()),
          ];
          // eslint-disable-next-line no-console
          console.warn(`Tool "${actionName}" not found. Available tools:`, [
            ...new Set(availableTools),
          ]);
          // Don't crash — return error to LLM so it can try a different action
          const output = `❌ Tool "${actionName}" is not available. Available tools: ${[
            ...new Set(availableTools),
          ].join(', ')}`;

          this.history.push({
            type: 'step',
            stepIndex: step,
            reflection,
            action: { name: actionName, input: toolInput, output },
            usage: {
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
            },
          } as AgentStepEvent);
          this.emitHistoryChange();
          // eslint-disable-next-line no-console
          console.groupEnd();
          step++;
          if (step > this.config.maxSteps) {
            this.history.push({ type: 'error', message: 'Step count exceeded maximum limit' });
            this.emitHistoryChange();
            this.onDone(false);
            return {
              success: false,
              data: 'Step count exceeded maximum limit',
              history: this.history,
            };
          }
          await waitFor(this.config.stepDelay ?? 0.4);
          continue;
        }

        // eslint-disable-next-line no-console
        console.log(`Executing tool: ${actionName}`, toolInput);

        // Emit executing activity
        this.emitActivity({ type: 'executing', tool: actionName, input: toolInput });

        const startTime = Date.now();

        // Execute tool, bind `this` to PageAgentCore
        const output = await selectedTool.execute.bind(this)(toolInput);

        const duration = Date.now() - startTime;
        // eslint-disable-next-line no-console
        console.log(`Tool (${actionName}) executed for ${duration}ms`, output);

        // Emit executed activity
        this.emitActivity({
          type: 'executed',
          tool: actionName,
          input: toolInput,
          output,
          duration,
        });

        // Track cumulative wait time
        if (actionName === 'wait') {
          this.states.totalWaitTime += toolInput?.seconds || 0;
        } else {
          this.states.totalWaitTime = 0;
        }

        // Record history
        const stepAction: AgentStepEvent['action'] = {
          name: actionName,
          input: toolInput,
          output,
        };

        this.history.push({
          type: 'step',
          stepIndex: step,
          reflection,
          action: stepAction,
          usage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
          },
        } as AgentStepEvent);
        this.emitHistoryChange();

        // eslint-disable-next-line no-console
        console.groupEnd();

        // Finish task if done
        if (actionName === 'done') {
          const success = toolInput?.success ?? false;
          const text = toolInput?.text || 'no text provided';
          // eslint-disable-next-line no-console
          console.log('Task completed', success, text);
          this.onDone(success);
          return {
            success,
            data: text,
            history: this.history,
          };
        }
      } catch (error: unknown) {
        // eslint-disable-next-line no-console
        console.groupEnd(); // prevent nested groups
        const isAbortError = (error as any)?.rawError?.name === 'AbortError';

        // eslint-disable-next-line no-console
        console.error('Task failed', error);
        const errorMessage = isAbortError ? 'Task stopped' : String(error);
        this.emitActivity({ type: 'error', message: errorMessage });
        this.history.push({ type: 'error', message: errorMessage, rawResponse: error });
        this.emitHistoryChange();
        this.onDone(false);
        return {
          success: false,
          data: errorMessage,
          history: this.history,
        };
      }

      step++;
      if (step > this.config.maxSteps) {
        const errorMessage = 'Step count exceeded maximum limit';
        this.history.push({ type: 'error', message: errorMessage });
        this.emitHistoryChange();
        this.onDone(false);
        return {
          success: false,
          data: errorMessage,
          history: this.history,
        };
      }

      await waitFor(this.config.stepDelay ?? 0.4);
    }
  }

  /**
   * Merge all tools into a single MacroTool (AnthropicToolDefinition) with:
   * - evaluation_previous_goal: string
   * - memory: string
   * - next_goal: string
   * - action: { toolName: toolInput }
   * where action must be selected from tools defined in this.tools
   */
  private packMacroTool(): AnthropicToolDefinition {
    // Merge three tool layers:
    // 1. Base DOM tools + built-in OSD tools (from this.tools)
    // 2. Plugin-registered tools from AssistantActionService (dynamic, re-read each step)
    // Plugin-registered tools override built-in OSD tools on name collision,
    // but never override base DOM tools (click, input, scroll, wait, done, ask_user).
    const baseDomToolNames = new Set([
      'click_element_by_index',
      'input_text',
      'select_dropdown_option',
      'scroll',
      'scroll_horizontally',
      'wait',
      'done',
      'ask_user',
    ]);

    const mergedTools = new Map(this.tools);

    // Read plugin-registered tools from AssistantActionService
    try {
      const actionService = AssistantActionService.getInstance();
      const pluginToolDefs = actionService.getToolDefinitions();

      for (const toolDef of pluginToolDefs) {
        // Don't override base DOM tools
        if (baseDomToolNames.has(toolDef.name)) continue;

        // Plugin tools override built-in OSD tools
        mergedTools.set(toolDef.name, {
          description: toolDef.description,
          inputSchema: toolDef.parameters || { type: 'object', properties: {} },
          execute: async (args: any) => {
            try {
              const result = await actionService.executeAction(toolDef.name, args);
              return typeof result === 'string'
                ? result
                : `✅ ${toolDef.name} executed: ${JSON.stringify(result).substring(0, 2000)}`;
            } catch (e: any) {
              return `❌ ${toolDef.name} failed: ${e.message || e}`;
            }
          },
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to read plugin-registered tools from AssistantActionService:', e);
    }

    // eslint-disable-next-line no-console
    console.log('Merged tools for this step:', Array.from(mergedTools.keys()));

    const actionSchemas = Array.from(mergedTools.entries()).map(([toolName, t]) => ({
      type: 'object' as const,
      properties: { [toolName]: t.inputSchema },
      required: [toolName],
      description: t.description,
    }));

    // Store merged tools for execution routing
    this.mergedToolsForCurrentStep = mergedTools;

    const macroTool: AnthropicToolDefinition = {
      name: 'AgentOutput',
      description: 'You MUST call this tool every step!',
      input_schema: {
        type: 'object',
        properties: {
          evaluation_previous_goal: { type: 'string' },
          memory: { type: 'string' },
          next_goal: { type: 'string' },
          action: { oneOf: actionSchemas },
        },
        required: ['action'],
      },
    };

    return macroTool;
  }

  /**
   * Get system prompt, dynamically replace language settings based on configured language.
   */
  private getSystemPrompt(): string {
    const targetLanguage = this.config.language === 'zh-CN' ? '中文' : 'English';
    const systemPrompt = SYSTEM_PROMPT.replace(
      /Default working language: \*\*.*?\*\*/,
      `Default working language: **${targetLanguage}**`
    );

    return systemPrompt;
  }

  /**
   * Get instructions from config.
   */
  private getInstructions(): string {
    const { instructions } = this.config;

    const systemInstructions = instructions?.system?.trim();
    let pageInstructions: string | undefined;

    const url = this.states.browserState?.url || '';
    if (instructions?.getPageInstructions && url) {
      try {
        pageInstructions = instructions.getPageInstructions(url)?.trim();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[PageAgent] Failed to execute getPageInstructions callback:', error);
      }
    }

    if (!systemInstructions && !pageInstructions) return '';

    let result = '<instructions>\n';

    if (systemInstructions) {
      result += `<system_instructions>\n${systemInstructions}\n</system_instructions>\n`;
    }

    if (pageInstructions) {
      result += `<page_instructions>\n${pageInstructions}\n</page_instructions>\n`;
    }

    result += '</instructions>\n\n';

    return result;
  }

  /**
   * Generate system observations before each step.
   */
  private async handleObservations(step: number): Promise<void> {
    // Accumulated wait time warning
    if (this.states.totalWaitTime >= 3) {
      this.pushObservation(
        `You have waited ${this.states.totalWaitTime} seconds accumulatively. ` +
          `DO NOT wait any longer unless you have a good reason.`
      );
    }

    // Detect URL change
    const currentURL = this.states.browserState?.url || '';
    if (currentURL !== this.states.lastURL) {
      this.pushObservation(`Page navigated to → ${currentURL}`);
      this.states.lastURL = currentURL;
      await waitFor(0.5); // wait for page to stabilize
    }

    // Remaining steps warning
    const remaining = this.config.maxSteps - step;
    if (remaining === 5) {
      this.pushObservation(
        `⚠️ Only ${remaining} steps remaining. ` +
          `Consider wrapping up or calling done with partial results.`
      );
    } else if (remaining === 2) {
      this.pushObservation(
        `⚠️ Critical: Only ${remaining} steps left! You must finish the task or call done immediately.`
      );
    }

    // Push observations to history and emit
    if (this.observations.length > 0) {
      for (const content of this.observations) {
        this.history.push({ type: 'observation', content });
        // eslint-disable-next-line no-console
        console.log('Observation:', content);
      }
      this.observations = [];
      this.emitHistoryChange();
    }
  }

  private async assembleUserPrompt(): Promise<string> {
    const browserState = this.states.browserState!;

    let prompt = '';

    // <instructions> (optional)

    prompt += this.getInstructions();

    // <agent_state>
    //  - <user_request>
    //  - <step_info>
    // </agent_state>

    const stepCount = this.history.filter((e) => e.type === 'step').length;

    prompt += '<agent_state>\n';
    prompt += '<user_request>\n';
    prompt += `${this.task}\n`;
    prompt += '</user_request>\n';
    prompt += '<step_info>\n';
    prompt += `Step ${stepCount + 1} of ${this.config.maxSteps} max possible steps\n`;
    prompt += `Current time: ${new Date().toLocaleString()}\n`;
    prompt += '</step_info>\n';
    prompt += '</agent_state>\n\n';

    // <osd_context>

    const osdCtx = this.osdContext.getContext();
    prompt += '<osd_context>\n';
    prompt += JSON.stringify(osdCtx, null, 2) + '\n';
    prompt += '</osd_context>\n\n';

    // <agent_history>
    //  - <step_N> for steps
    //  - <sys> for observations and system messages

    prompt += '<agent_history>\n';

    let stepIndex = 0;
    for (const event of this.history) {
      if (event.type === 'step') {
        stepIndex++;
        prompt += `<step_${stepIndex}>\n`;
        prompt += `Evaluation of Previous Step: ${event.reflection.evaluation_previous_goal}\n`;
        prompt += `Memory: ${event.reflection.memory}\n`;
        prompt += `Next Goal: ${event.reflection.next_goal}\n`;
        prompt += `Action Results: ${event.action.output}\n`;
        prompt += `</step_${stepIndex}>\n`;
      } else if (event.type === 'observation') {
        prompt += `<sys>${event.content}</sys>\n`;
      } else if (event.type === 'user_takeover') {
        prompt += `<sys>User took over control and made changes to the page</sys>\n`;
      }
      // Error events are excluded from LLM context
    }

    prompt += '</agent_history>\n\n';

    // <browser_state>

    prompt += '<browser_state>\n';
    prompt += browserState.header + '\n';
    prompt += browserState.content + '\n';
    prompt += browserState.footer + '\n\n';
    prompt += '</browser_state>\n\n';

    return prompt;
  }

  private onDone(success = true) {
    this.pageController.cleanUpHighlights();
    this.setStatus(success ? 'completed' : 'error');
    this.abortController.abort();
  }

  dispose() {
    // eslint-disable-next-line no-console
    console.log('Disposing PageAgent...');
    this.disposed = true;
    this.pageController.dispose();
    this.abortController.abort();

    // Emit dispose event for UI cleanup
    this.dispatchEvent(new Event('dispose'));
  }
}
