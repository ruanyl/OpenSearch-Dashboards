/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared types for the osd-page-agent plugin.
 *
 * Adapted from page-agent:
 * - packages/core/src/types.ts
 * - packages/page-controller/src/dom/dom_tree/type.ts
 * - packages/page-controller/src/PageController.ts (BrowserState, ActionResult)
 * - packages/core/src/tools/index.ts (PageAgentTool)
 *
 * Modifications:
 * - Removed all Zod imports and schemas (OSD doesn't use Zod)
 * - Removed @page-agent/* imports
 * - Removed LLMConfig extension from AgentConfig (replaced with OSD-specific fields)
 * - Removed lifecycle hooks (onBeforeStep, onAfterStep, etc.)
 * - Removed experimental features (experimentalScriptExecutionTool, experimentalLlmsTxt, etc.)
 * - Changed PageAgentTool.inputSchema from z.ZodType to Record<string, any> (JSON Schema)
 * - Added Anthropic/Bedrock API types (AnthropicToolDefinition, LlmChatRequest, LlmChatResponse, LlmProxyError)
 * - Added OsdContext interface for OSD-aware context injection
 */

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

/** Supported UI languages */
export type SupportedLanguage = 'en-US' | 'zh-CN';

// ---------------------------------------------------------------------------
// Agent Configuration
// ---------------------------------------------------------------------------

/**
 * Agent configuration for the OSD page agent.
 *
 * Unlike page-agent's AgentConfig which extends LLMConfig, this uses
 * OSD-specific configuration fields. LLM settings are read from the
 * server-side plugin config and accessed via the LLM proxy.
 */
export interface AgentConfig {
  /** UI language for the agent */
  language?: SupportedLanguage;

  /**
   * Maximum number of steps the agent can take per task.
   * @default 40
   */
  maxSteps?: number;

  /**
   * Delay between steps in seconds.
   * @default 0.4
   */
  stepDelay?: number;

  /** Bedrock model ID (exposed from server config, no secrets) */
  modelId: string;

  /**
   * Maximum number of LLM retry attempts on retryable errors.
   * @default 3
   */
  maxRetries?: number;

  /**
   * Custom tools to extend agent capabilities.
   * You can also override or remove internal tools by using the same name.
   * Set a tool to `null` to remove it.
   */
  customTools?: Record<string, PageAgentTool | null>;

  /**
   * Instructions to guide the agent's behavior.
   */
  instructions?: {
    /** Global system-level instructions, applied to all tasks */
    system?: string;

    /**
     * Dynamic page-level instructions callback.
     * Called before each step to get instructions for the current page.
     * @param url - Current page URL
     * @returns Instructions string, or undefined/null to skip
     */
    getPageInstructions?: (url: string) => string | undefined | null;
  };
}

// ---------------------------------------------------------------------------
// Agent Reflection & Macro Tool
// ---------------------------------------------------------------------------

/**
 * Agent reflection state — the reflection-before-action model.
 *
 * Every tool call must first reflect on:
 * - evaluation_previous_goal: How well did the previous action achieve its goal?
 * - memory: Key information to remember for future steps
 * - next_goal: What should be accomplished in the next action?
 */
export interface AgentReflection {
  evaluation_previous_goal: string;
  memory: string;
  next_goal: string;
}

/**
 * MacroTool input structure.
 *
 * This is the core abstraction that enforces the "reflection-before-action" mental model.
 * Before executing any action, the LLM must output its reasoning state.
 */
export interface MacroToolInput extends Partial<AgentReflection> {
  action: Record<string, any>;
}

/** MacroTool output structure */
export interface MacroToolResult {
  input: MacroToolInput;
  output: string;
}

// ---------------------------------------------------------------------------
// Agent Events
// ---------------------------------------------------------------------------

/**
 * A single agent step with reflection and action.
 *
 * Adapted from page-agent's AgentStepEvent. Usage fields simplified
 * to match Anthropic Messages API response format (input_tokens / output_tokens).
 */
export interface AgentStepEvent {
  type: 'step';
  stepIndex: number;
  reflection: Partial<AgentReflection>;
  action: {
    name: string;
    input: any;
    output: string;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** Persistent observation event (stays in agent memory) */
export interface ObservationEvent {
  type: 'observation';
  content: string;
}

/** User takeover event — user manually interacted with the page */
export interface UserTakeoverEvent {
  type: 'user_takeover';
}

/** Retry event — LLM call is being retried */
export interface RetryEvent {
  type: 'retry';
  message: string;
  attempt: number;
  maxAttempts: number;
}

/** Error event — fatal error from LLM or execution */
export interface AgentErrorEvent {
  type: 'error';
  message: string;
  rawResponse?: unknown;
}

/** Union type for all history events */
export type HistoricalEvent =
  | AgentStepEvent
  | ObservationEvent
  | UserTakeoverEvent
  | RetryEvent
  | AgentErrorEvent;

// ---------------------------------------------------------------------------
// Agent Status & Activity
// ---------------------------------------------------------------------------

/** Agent execution status */
export type AgentStatus = 'idle' | 'running' | 'completed' | 'error';

/**
 * Agent activity — transient state for immediate UI feedback.
 *
 * Unlike historical events (which are persisted), activities are ephemeral
 * and represent "what the agent is doing right now". UI components should
 * listen to 'activity' events to show real-time feedback.
 *
 * Note: There is no 'idle' activity — absence of activity events means idle.
 */
export type AgentActivity =
  | { type: 'thinking' }
  | { type: 'executing'; tool: string; input: unknown }
  | { type: 'executed'; tool: string; input: unknown; output: string; duration: number }
  | { type: 'retrying'; attempt: number; maxAttempts: number }
  | { type: 'error'; message: string };

/** Result of a completed agent task execution */
export interface ExecutionResult {
  success: boolean;
  data: string;
  history: HistoricalEvent[];
}

// ---------------------------------------------------------------------------
// DOM Tree Types (from page-controller dom_tree/type.ts)
// ---------------------------------------------------------------------------

/** Flat DOM tree structure for efficient storage and traversal of page structure */
export interface FlatDomTree {
  rootId: string;
  map: Record<string, DomNode>;
}

export type DomNode = TextDomNode | ElementDomNode | InteractiveElementDomNode;

export interface TextDomNode {
  type: 'TEXT_NODE';
  text: string;
  isVisible: boolean;
  [key: string]: unknown;
}

export interface ElementDomNode {
  tagName: string;
  attributes?: Record<string, string>;
  xpath?: string;
  children?: string[];
  isVisible?: boolean;
  isTopElement?: boolean;
  isInViewport?: boolean;
  isNew?: boolean;
  isInteractive?: false;
  highlightIndex?: number;
  extra?: Record<string, any>;
  [key: string]: unknown;
}

export interface InteractiveElementDomNode {
  tagName: string;
  attributes?: Record<string, string>;
  xpath?: string;
  children?: string[];
  isVisible?: boolean;
  isTopElement?: boolean;
  isInViewport?: boolean;
  isInteractive: true;
  highlightIndex: number;
  /** Direct DOM reference for action execution */
  ref: HTMLElement;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// PageController Types (from PageController.ts)
// ---------------------------------------------------------------------------

/** Structured browser state for LLM consumption */
export interface BrowserState {
  url: string;
  title: string;
  /** Page info + scroll position hint (e.g. "Page info: 1920x1080px...\n[Start of page]") */
  header: string;
  /** Simplified HTML of interactive elements */
  content: string;
  /** Page footer hint (e.g. "... 300 pixels below ..." or "[End of page]") */
  footer: string;
}

/** Result of a DOM action execution */
export interface ActionResult {
  success: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Tool Interface (from core/src/tools/index.ts)
// ---------------------------------------------------------------------------

/**
 * Internal tool definition that has access to PageAgentCore `this` context.
 *
 * Adapted from page-agent's PageAgentTool:
 * - inputSchema uses JSON Schema (Record<string, any>) instead of Zod
 * - execute is bound to PageAgentCore at call time
 */
export interface PageAgentTool<TParams = any> {
  description: string;
  /** JSON Schema object describing the tool's input parameters */
  inputSchema: Record<string, any>;
  execute: (args: TParams) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Anthropic / Bedrock API Types
// ---------------------------------------------------------------------------

/** Tool definition in Anthropic Messages API format */
export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

/** Request body sent to the LLM proxy (Anthropic Messages API format) */
export interface LlmChatRequest {
  messages: Array<{ role: string; content: any }>;
  max_tokens: number;
  tools?: AnthropicToolDefinition[];
  tool_choice?: { type: string; name?: string };
  temperature?: number;
  /** Top-level system prompt (Anthropic uses this instead of a system role message) */
  system?: string;
}

/**
 * Response body from the LLM proxy (Anthropic Messages API format).
 *
 * Content blocks can be text or tool_use. The agent parses tool_use blocks
 * to extract the MacroTool response.
 */
export interface LlmChatResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, any>;
  }>;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/** Structured error response from the LLM proxy */
export interface LlmProxyError {
  statusCode: number;
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// OSD Context
// ---------------------------------------------------------------------------

/**
 * Metadata about the current OSD application state.
 *
 * Injected into the LLM prompt to help the agent reason about
 * where the user is and what actions make sense.
 */
export interface OsdContext {
  /** Current OSD application ID (e.g. "explore", "dashboards", "dev_tools") */
  currentAppId: string;
  /** Current workspace name, if workspaces are enabled */
  workspaceName?: string;
  /** Currently selected index pattern */
  currentIndexPattern?: {
    id: string;
    title: string;
    timeField?: string;
  };
  /** Current query bar content */
  currentQuery?: {
    query: string;
    language: string;
  };
  /** Current global time range */
  currentTimeRange?: {
    from: string;
    to: string;
  };
  /** Currently applied filters */
  appliedFilters?: Array<{
    field: string;
    value: string;
  }>;
}
