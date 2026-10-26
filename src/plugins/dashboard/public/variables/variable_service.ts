/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEqual } from 'lodash';
import { Observable, BehaviorSubject, Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { DataPublicPluginStart, TimeRange } from '../../../data/public';
import { SavedObjectsClientContract } from '../../../../core/public';
import {
  Variable,
  VariableType,
  VariableSortOrder,
  QueryVariable,
  CustomVariable,
  TextVariable,
  VariableWithState,
  VariableOption,
  VariableOptionType,
  NormalizedVariableOption,
  DistributiveOmit,
  PromQLResourceQuery,
  isAllMarker,
  ALL_OPTION_VALUE,
} from './types';
import {
  buildVariableOptionsFromQueryResult,
  executeVariableQuery,
  applyRegexToVariableOptions,
  VariableQueryResult,
} from './variable_query_utils';
import {
  executePromQLResourceQuery,
  buildPromQLVariableOptions,
  interpolateResourceQuery,
  collectResourceQueryTextFields,
} from './promql_variable_query_utils';
import { normalizePersistedVariables } from './variable_query_utils';
import {
  IVariableInterpolationService,
  VariableInterpolationService,
} from './variable_interpolation_service';

/**
 * Max options rendered at once in the selector. Runtime state keeps the full
 * list so search and "All" cover every value.
 */
export const MAX_DISPLAY_OPTIONS = 100;

/**
 * Minimal telemetry sink so this service can report feature usage without
 * depending on core. Mirrors the pattern used by the query_enhancements plugin.
 * Callers wire this to core.telemetry's plugin recorder; when omitted, all
 * reporting is skipped.
 */
export type VariableTelemetrySink = (event: { name: string; data: Record<string, any> }) => void;

/** Query results and request ownership; definitions and presentation stay outside this cache. */
interface QueryExecution {
  /** Keep backend order so changing the sort never changes the cached result. */
  options: NormalizedVariableOption[];
  optionType?: VariableOptionType;
  error?: string;
  /** Key of the last started attempt; failures only retry on changed inputs or reload. */
  lastAttemptKey?: string;
  status: 'idle' | 'waiting' | 'pending' | 'fetching';
  controller?: AbortController;
}

/** External inputs of the refresh scheduler. */
export interface VariableRefreshSchedulerInputs {
  /** Current time range. Must emit its initial value on subscribe. */
  time$: Observable<TimeRange | undefined>;
  /** Each emission re-queries every query variable, even if its inputs did not change. */
  reload$: Observable<unknown>;
}

/**
 * VariableService — a self-contained feature for managing dashboard variables.
 */
export class VariableService {
  private dataPlugin?: DataPublicPluginStart;
  private dashboardId?: string;
  private savedObjectsClient?: SavedObjectsClientContract;
  private variables: Variable[] = [];
  private variables$ = new BehaviorSubject<VariableWithState[]>([]);
  private interpolationService?: IVariableInterpolationService;
  private queryExecutions = new Map<string, QueryExecution>();
  private telemetrySink?: VariableTelemetrySink;

  // Refresh scheduler state. See startRefreshScheduler().
  private schedulerSubscription?: Subscription;
  private schedulerTime?: TimeRange;
  private schedulerTimeReady = false;
  private reloadToken = 0;
  private refreshScheduled = false;
  private settledWaiters: Array<() => void> = [];

  /**
   * @param dataPlugin - Data plugin for executing queries
   * @param dashboardId - Dashboard ID for auto-saving (optional)
   * @param savedObjectsClient - Client for saving to dashboard saved object
   * @param telemetrySink - Optional sink for feature-usage telemetry
   */
  constructor(
    dataPlugin?: DataPublicPluginStart,
    dashboardId?: string,
    savedObjectsClient?: SavedObjectsClientContract,
    telemetrySink?: VariableTelemetrySink
  ) {
    this.dataPlugin = dataPlugin;
    this.dashboardId = dashboardId;
    this.savedObjectsClient = savedObjectsClient;
    this.telemetrySink = telemetrySink;
  }

  /**
   * Report a telemetry event. Never throws -- telemetry must not break the
   * feature it measures.
   */
  private recordTelemetry(name: string, data: Record<string, any> = {}): void {
    try {
      this.telemetrySink?.({ name, data });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[VariableService] Failed to record telemetry:', e);
    }
  }

  public setInterpolationService(service: IVariableInterpolationService): void {
    this.interpolationService = service;
  }

  /**
   * Update the dashboard ID after dashboard is saved.
   * This allows variables to be saved to the dashboard after it gets an ID.
   */
  public setDashboardId(dashboardId: string): void {
    this.dashboardId = dashboardId;
  }

  /**
   * Initialize the service with variables loaded from dashboard saved object.
   * This should be called once after creating the service.
   *
   * @param initialVariables - Variables loaded from dashboard saved object
   */
  public initialize(initialVariables: Variable[] = []): void {
    this.setVariables(initialVariables);

    // Telemetry: reported once per dashboard load that carries variables.
    if (initialVariables.length > 0) {
      this.recordTelemetry('variables_loaded', {
        count: initialVariables.length,
        types: Array.from(new Set(initialVariables.map((v) => v.type))),
      });
    }
  }

  /**
   * Initialize the service by loading variables from dashboard saved object (asynchronous).
   * Only works if dashboardId and savedObjectsClient were provided in constructor.
   * This should be called once after creating the service, as an alternative to initialize().
   */
  public async initializeFromDashboard(): Promise<void> {
    if (!this.dashboardId || !this.savedObjectsClient) {
      return;
    }

    try {
      const dashboard = await this.savedObjectsClient.get<{ variablesJSON?: string }>(
        'dashboard',
        this.dashboardId
      );
      let variables: Variable[] = [];

      if (dashboard.attributes.variablesJSON) {
        const parsed = JSON.parse(dashboard.attributes.variablesJSON);
        variables = normalizePersistedVariables(parsed.variables) ?? [];
      }

      this.initialize(variables);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[VariableService] Failed to load variables from dashboard:', error);
    }
  }

  /**
   * Observable of variables merged with their runtime state.
   * Use this for UI components that need loading/error states.
   */
  public getVariables$(): Observable<VariableWithState[]> {
    return this.variables$.pipe(distinctUntilChanged((prev, curr) => isEqual(prev, curr)));
  }

  /**
   * Observable of pure variables (configuration + current values only, no runtime state).
   * Use this for persistence/serialization where runtime state should be excluded.
   */
  public getVariablesWithoutState$(): Observable<Variable[]> {
    return this.variables$.pipe(
      map((variables) =>
        variables.map(({ options, optionType, loading, error, ...variable }) => variable)
      ),
      distinctUntilChanged((prev, curr) => isEqual(prev, curr))
    );
  }

  /**
   * Get current variables (without runtime state).
   */
  public getVariables(): Variable[] {
    return this.variables;
  }

  /**
   * Get current variables merged with runtime state (synchronous).
   * Use this for interpolation where runtime state (optionType) is needed.
   */
  public getVariablesWithState(): VariableWithState[] {
    return this.variables.map((variable) => {
      if (variable.type !== VariableType.Query) {
        return {
          ...variable,
          options: variable.type === VariableType.Custom ? this.getCustomOptions(variable) : [],
          loading: false,
        };
      }
      const execution = this.queryExecutions.get(variable.id);
      return {
        ...variable,
        options: this.sortVariableOptions(execution?.options ?? [], variable.sort),
        optionType: execution?.optionType,
        loading: execution ? execution.status !== 'idle' : false,
        error: execution?.error,
      };
    });
  }

  /**
   * Add a new variable.
   */
  public async addVariable(variable: DistributiveOmit<Variable, 'id'>): Promise<void> {
    const id = this.generateId();
    const newVariable = this.buildVariable(id, variable);

    if (newVariable.type === VariableType.Text) {
      newVariable.current = variable.current;
    } else {
      const options =
        newVariable.type === VariableType.Custom ? this.getCustomOptions(newVariable) : [];
      newVariable.current = options.length > 0 ? [options[0].value] : undefined;
    }

    const updatedVariables = [...this.getVariables(), newVariable];

    try {
      await this.saveVariables(updatedVariables);
    } catch (error) {
      this.recordTelemetry('variable_create_failed', {
        type: newVariable.type,
        errorType: (error as Error)?.name ?? 'Unknown',
      });
      throw error;
    }
    this.recordTelemetry('variable_create_succeeded', { type: newVariable.type });
  }

  public async updateVariable(id: string, updates: Partial<Variable>): Promise<void> {
    const currentVariables = this.getVariables();
    const index = currentVariables.findIndex((v) => v.id === id);
    if (index === -1) {
      throw new Error(`Variable with id ${id} not found`);
    }

    const existing = currentVariables[index];
    let updatedVariable: Variable;
    if (updates.type && updates.type !== existing.type) {
      // Rebuild the definition so fields from the previous type are discarded.
      updatedVariable = this.buildVariable(id, { ...existing, ...updates } as DistributiveOmit<
        Variable,
        'id' | 'current'
      >);
      if (updatedVariable.type === VariableType.Text) {
        const next = updates.current;
        updatedVariable.current = next && next.length > 0 ? [next[0]] : undefined;
      } else {
        const options =
          updatedVariable.type === VariableType.Custom
            ? this.getCustomOptions(updatedVariable)
            : [];
        updatedVariable.current = options.length > 0 ? [options[0].value] : undefined;
      }
    } else {
      updatedVariable = { ...existing, ...updates } as Variable;

      if (updatedVariable.type === VariableType.Custom) {
        const customOptionsChanged =
          (updates as Partial<CustomVariable>).customOptions !== undefined &&
          !isEqual(
            (updates as Partial<CustomVariable>).customOptions,
            (existing as CustomVariable).customOptions
          );
        if (customOptionsChanged) {
          // "All" follows the new options; concrete selections are reconciled by value.
          updatedVariable.current = isAllMarker(updatedVariable.current)
            ? updatedVariable.current
            : this.resolveCurrentValueForCustom(
                updatedVariable.current,
                this.getCustomOptions(updatedVariable),
                updatedVariable.multi
              );
        }
      }

      // When switching from multi to single, trim current to first value
      if (updates.multi === false && existing.multi === true && updatedVariable.current) {
        const current = this.clearAllMarker(updatedVariable.current);
        updatedVariable.current = current?.length ? [current[0]] : undefined;
      }

      // "All" no longer exists as an option, so drop the marker.
      if (updates.includeAll === false && existing.includeAll === true) {
        updatedVariable.current = this.clearAllMarker(updatedVariable.current);
      }
    }

    const updatedVariables = [...currentVariables];
    updatedVariables[index] = updatedVariable;

    try {
      await this.saveVariables(updatedVariables);
    } catch (error) {
      this.recordTelemetry('variable_update_failed', {
        type: updatedVariable.type,
        errorType: (error as Error)?.name ?? 'Unknown',
      });
      throw error;
    }
    this.recordTelemetry('variable_update_succeeded', { type: updatedVariable.type });
  }

  public async removeVariable(id: string): Promise<void> {
    const removed = this.getVariables().find((v) => v.id === id);
    const updatedVariables = this.getVariables().filter((v) => v.id !== id);
    await this.saveVariables(updatedVariables);
    this.recordTelemetry('variable_deleted', { type: removed?.type ?? 'unknown' });
  }

  public reorderVariables(sourceIndex: number, destinationIndex: number): void {
    const vars = [...this.getVariables()];
    const [moved] = vars.splice(sourceIndex, 1);
    vars.splice(destinationIndex, 0, moved);
    this.setVariables(vars);
  }

  /**
   * Toggle variable visibility in memory without persisting to backend.
   * Changes will be saved when the dashboard is saved.
   */
  public toggleVariableHide(id: string): void {
    const currentVariables = this.getVariables();
    const updatedVariables = currentVariables.map((v) =>
      v.id === id ? ({ ...v, hide: !v.hide } as Variable) : v
    );
    this.setVariables(updatedVariables);
  }

  public updateVariableValue(id: string, value: string[]): void {
    const currentVariables = this.getVariables();
    const index = currentVariables.findIndex((v) => v.id === id);
    if (index === -1) {
      throw new Error(`Variable with id ${id} not found`);
    }

    const variable = currentVariables[index];
    const updatedVariables = [...currentVariables];
    updatedVariables[index] = {
      ...variable,
      current: this.normalizeAllSelection(value),
    } as Variable;
    this.setVariables(updatedVariables);
    // Telemetry: record variable change.
    this.recordTelemetry('variable_value_changed', { type: variable.type });
  }

  /**
   * Start the refresh scheduler. From then on every query variable is
   * re-queried whenever its fetch inputs change (see computeFetchKey), so no
   * mutation needs to choose what to refresh. Reconcile publishes pending
   * variables immediately; queries start after `time$` has emitted.
   * Starting again stops the previous scheduler.
   */
  public startRefreshScheduler({ time$, reload$ }: VariableRefreshSchedulerInputs): () => void {
    this.stopRefreshScheduler();
    const subscription = new Subscription();
    this.schedulerSubscription = subscription;

    subscription.add(
      time$.subscribe((time) => {
        this.schedulerTime = time;
        this.schedulerTimeReady = true;
        this.reconcile();
      })
    );
    subscription.add(
      reload$.subscribe(() => {
        this.reloadToken++;
        this.reconcile();
      })
    );
    this.reconcile();

    return () => {
      if (this.schedulerSubscription === subscription) {
        this.stopRefreshScheduler();
        this.reconcile();
      }
    };
  }

  private stopRefreshScheduler(): void {
    this.schedulerSubscription?.unsubscribe();
    this.schedulerSubscription = undefined;
    this.schedulerTimeReady = false;
    for (const execution of this.queryExecutions.values()) {
      // Active requests can finish; queued and waiting work ends with the scheduler.
      if (execution.status !== 'fetching') execution.status = 'idle';
      execution.lastAttemptKey = undefined;
    }
    this.resolveSettledWaiters();
  }

  /**
   * Resolves once no query variable is loading or waiting on an upstream and
   * no query is queued to start.
   */
  public whenSettled(): Promise<void> {
    if (this.isSettled()) return Promise.resolve();
    return new Promise((resolve) => this.settledWaiters.push(resolve));
  }

  private isSettled(): boolean {
    return (
      !this.refreshScheduled &&
      [...this.queryExecutions.values()].every((execution) => execution.status === 'idle')
    );
  }

  private resolveSettledWaiters(): void {
    if (!this.isSettled() && this.schedulerSubscription) return;
    const waiters = this.settledWaiters;
    this.settledWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  private setVariables(variables: Variable[]): void {
    this.variables = variables;
    this.reconcile();
  }

  /**
   * Reconciles query execution with the latest definitions, selections and time.
   * Variables are visited in list order, and a variable only interpolates
   * variables listed before it, so its upstreams are visited first.
   * Publish once every affected variable is pending or waiting, so consumers
   * never see a ready snapshot combining new inputs and old dependent results.
   */
  private reconcile(): void {
    const queryIds = new Set(
      this.variables.filter((variable) => variable.type === VariableType.Query).map((v) => v.id)
    );
    for (const [id, execution] of this.queryExecutions) {
      if (!queryIds.has(id)) {
        execution.controller?.abort();
        this.queryExecutions.delete(id);
      }
    }

    if (this.schedulerSubscription) {
      this.variables.forEach((variable, index) => {
        if (variable.type !== VariableType.Query) return;
        let execution = this.queryExecutions.get(variable.id);
        if (!execution) {
          execution = { options: [], status: 'idle' };
          this.queryExecutions.set(variable.id, execution);
        }

        const upstream = this.getUpstreamIds(variable, this.variables, index);
        const waiting =
          !this.schedulerTimeReady ||
          upstream.some((id) => {
            const parent = this.queryExecutions.get(id);
            return parent && parent.status !== 'idle';
          });
        let nextStatus: QueryExecution['status'];
        if (waiting) {
          nextStatus = 'waiting';
        } else if (this.computeFetchKey(variable) !== execution.lastAttemptKey) {
          nextStatus = 'pending';
        } else {
          nextStatus = execution.controller ? 'fetching' : 'idle';
        }

        if (execution.controller && (nextStatus === 'waiting' || nextStatus === 'pending')) {
          execution.controller.abort();
          execution.controller = undefined;
          // An interrupted attempt must run again even if the inputs return to its key.
          execution.lastAttemptKey = undefined;
        }
        execution.status = nextStatus;
      });
    }

    this.scheduleRefreshes();
    this.variables$.next(this.getVariablesWithState());
    this.resolveSettledWaiters();
  }

  /** Coalesce input changes in this task, then start independent pending queries in parallel. */
  private scheduleRefreshes(): void {
    if (
      this.refreshScheduled ||
      !this.schedulerSubscription ||
      !this.schedulerTimeReady ||
      ![...this.queryExecutions.values()].some((execution) => execution.status === 'pending')
    ) {
      return;
    }
    this.refreshScheduled = true;
    Promise.resolve().then(() => {
      if (this.schedulerSubscription && this.schedulerTimeReady) {
        this.variables.forEach((variable) => {
          const execution = this.queryExecutions.get(variable.id);
          if (variable.type === VariableType.Query && execution?.status === 'pending') {
            void this.refreshVariableOptions(variable, execution);
          }
        });
      }
      this.refreshScheduled = false;
      this.reconcile();
    });
  }

  /** Ids of variables listed before `variable` that its query references. */
  private getUpstreamIds(variable: QueryVariable, variables: Variable[], index: number): string[] {
    const referenced = this.getReferencedVariableNames(variable);
    return variables
      .slice(0, index)
      .filter((v) => referenced.has(v.name))
      .map((v) => v.id);
  }

  /**
   * Everything a query variable's options depend on. Upstream values, "All"
   * expansion, renames, removals and ordering all show up in the interpolated
   * query, so equal keys mean an identical query.
   */
  private computeFetchKey(variable: QueryVariable): string {
    // The key uses the scheduler's time$ (the container's input.timeRange),
    // while the query itself reads the global timefilter (searchSource and
    // executePromQLResourceQuery). On a dashboard the two are kept in sync; if
    // they ever diverge, the time a query uses could change without its key.
    const time = variable.useTimeFilter
      ? { from: this.schedulerTime?.from, to: this.schedulerTime?.to }
      : undefined;
    return JSON.stringify({
      query: this.resolveQueryForFetch(variable),
      language: variable.language,
      dataset: variable.dataset,
      sourceKind: variable.sourceKind,
      valueField: variable.sourceKind === 'prometheusResource' ? undefined : variable.valueField,
      labelField: variable.sourceKind === 'prometheusResource' ? undefined : variable.labelField,
      regex: variable.regex,
      time,
      reload: this.reloadToken,
    });
  }

  /**
   * The query a variable will actually send: its query text, or PromQL resource
   * query, with the variables listed before it interpolated.
   */
  private resolveQueryForFetch(variable: QueryVariable): string | PromQLResourceQuery {
    return variable.sourceKind === 'prometheusResource'
      ? this.resolveResourceQueryForFetch(variable)
      : this.resolveQueryTextForFetch(variable);
  }

  private resolveResourceQueryForFetch(
    variable: Extract<QueryVariable, { sourceKind: 'prometheusResource' }>
  ): PromQLResourceQuery {
    const interpolation = this.interpolationService;
    if (!interpolation) return variable.promQLResourceQuery;
    return interpolateResourceQuery(variable.promQLResourceQuery, (value) =>
      interpolation.hasVariables(value)
        ? interpolation.interpolate(value, variable.language, variable.name, true)
        : value
    );
  }

  private resolveQueryTextForFetch(
    variable: Exclude<QueryVariable, { sourceKind: 'prometheusResource' }>
  ): string {
    const interpolation = this.interpolationService;
    if (!interpolation || !interpolation.hasVariables(variable.query)) return variable.query;
    // Order constraint: only variables listed before this one are interpolated.
    return interpolation.interpolate(variable.query, variable.language, variable.name);
  }

  private async refreshVariableOptions(
    queryVariable: QueryVariable,
    execution: QueryExecution
  ): Promise<void> {
    const id = queryVariable.id;
    const controller = new AbortController();
    execution.lastAttemptKey = this.computeFetchKey(queryVariable);
    execution.controller = controller;
    execution.status = 'fetching';
    execution.error = undefined;
    const ownsRequest = () =>
      this.queryExecutions.get(id) === execution && execution.controller === controller;

    try {
      let options: NormalizedVariableOption[];
      let optionType: VariableOptionType | undefined;

      if (queryVariable.sourceKind === 'prometheusResource') {
        if (!this.dataPlugin) {
          throw new Error('VariableService not initialized with dataPlugin');
        }

        const timeRange = queryVariable.useTimeFilter
          ? this.dataPlugin.query.timefilter.timefilter.getTime()
          : undefined;

        const values = await executePromQLResourceQuery(
          this.dataPlugin,
          queryVariable.dataset?.id,
          this.resolveResourceQueryForFetch(queryVariable),
          timeRange
        );
        options = buildPromQLVariableOptions(values, queryVariable.regex);
        optionType = 'string';
      } else {
        const result = await this.fetchOptionsForVariableWithType(
          queryVariable,
          this.resolveQueryTextForFetch(queryVariable),
          controller.signal
        );
        const builtResult = buildVariableOptionsFromQueryResult(result, {
          valueField: queryVariable.valueField,
          labelField: queryVariable.labelField,
        });

        options = builtResult.options;
        if (queryVariable.regex) {
          options = applyRegexToVariableOptions(options, queryVariable.regex);
        }
        optionType = builtResult.optionType;
      }

      if (!ownsRequest() || controller.signal.aborted) {
        return;
      }

      // Read current now rather than at the start: the user may have changed
      // the value while the query was running.
      const latest = this.getVariables().find((v) => v.id === id);
      if (!latest || latest.type !== VariableType.Query) {
        return;
      }
      // Sorting is a view of the result, so use the latest definition for the default selection.
      const sortedOptions = this.sortVariableOptions(options, latest.sort);
      const preservedCurrent = this.resolveCurrentValueForQuery(
        latest.current,
        this.getOptionValues(sortedOptions)
      );
      execution.options = options;
      execution.optionType = optionType;
      this.variables = this.variables.map((v) =>
        v.id === id ? { ...v, current: preservedCurrent } : v
      );
    } catch (error: any) {
      // Superseded successes and failures cannot change the current request's state.
      if (!ownsRequest() || controller.signal.aborted || error?.name === 'AbortError') return;
      this.recordTelemetry('variable_query_failed', {
        type: queryVariable.type,
        language: queryVariable.language ?? 'unknown',
        errorType: error?.name ?? 'Unknown',
      });
      execution.error = error.message || 'Failed to fetch options';
    } finally {
      if (ownsRequest()) {
        execution.controller = undefined;
        execution.status = 'idle';
        this.reconcile();
      }
    }
  }

  /** Names of the variables a query variable references, using the interpolation syntax. */
  private getReferencedVariableNames(variable: QueryVariable): Set<string> {
    const names = new Set<string>();
    const texts =
      variable.sourceKind === 'prometheusResource'
        ? collectResourceQueryTextFields(variable.promQLResourceQuery)
        : [variable.query];
    for (const text of texts) {
      if (typeof text !== 'string') continue;
      const pattern = VariableInterpolationService.VARIABLE_PATTERN;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        names.add(match[1] || match[2]);
      }
    }
    return names;
  }

  private getCustomOptions(variable: CustomVariable): NormalizedVariableOption[] {
    return this.sortVariableOptions(
      this.normalizeCustomOptions(variable.customOptions),
      variable.sort
    );
  }

  private sortVariableOptions(
    options: NormalizedVariableOption[],
    sort?: VariableSortOrder
  ): NormalizedVariableOption[] {
    if (!sort || sort === VariableSortOrder.Disabled) return options;

    const sorted = [...options];
    const getDisplayText = (option: NormalizedVariableOption) => option.label || option.value;
    switch (sort) {
      case VariableSortOrder.AlphabeticalAsc:
        return sorted.sort((a, b) => getDisplayText(a).localeCompare(getDisplayText(b)));
      case VariableSortOrder.AlphabeticalDesc:
        return sorted.sort((a, b) => getDisplayText(b).localeCompare(getDisplayText(a)));
      case VariableSortOrder.NumericalAsc:
        return sorted.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
      case VariableSortOrder.NumericalDesc:
        return sorted.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
      default:
        return sorted;
    }
  }

  private normalizeCustomOptions(options: VariableOption[] = []): NormalizedVariableOption[] {
    return options.map((option) => {
      if (typeof option === 'string') {
        return { value: option };
      }

      const label = option.label?.trim();
      return {
        value: option.value,
        ...(label ? { label } : {}),
      };
    });
  }

  private getOptionValues(options: NormalizedVariableOption[]): string[] {
    return options.map((option) => option.value);
  }

  private normalizeVariableForPersistence(variable: Variable): Variable {
    if (variable.type !== VariableType.Custom) {
      return variable;
    }

    return {
      ...variable,
      customOptions: this.normalizeCustomOptions(variable.customOptions),
    };
  }

  /**
   * Resolve current value for Custom variables.
   * If current value is not in options, reset to first option.
   */
  private resolveCurrentValueForCustom(
    currentVal: string[] | undefined,
    options: NormalizedVariableOption[],
    multi?: boolean
  ): string[] | undefined {
    const optionValues = this.getOptionValues(options);
    if (currentVal && currentVal.length > 0 && optionValues.length > 0) {
      if (multi) {
        const selected = currentVal.filter((v) => optionValues.includes(v));
        return selected.length > 0 ? selected : [optionValues[0]];
      }
      return optionValues.includes(currentVal[0]) ? [currentVal[0]] : [optionValues[0]];
    }
    return optionValues.length > 0 ? [optionValues[0]] : undefined;
  }

  /**
   * Resolve current value for Query variables.
   * Preserve current value even if not in options (options may change with time range).
   */
  private resolveCurrentValueForQuery(
    currentVal: string[] | undefined,
    options: string[]
  ): string[] | undefined {
    if (currentVal && currentVal.length > 0) {
      // Always preserve user's selection for Query variables
      return currentVal;
    }
    // No current value: default to first option if available
    return options.length > 0 ? [options[0]] : undefined;
  }

  private clearAllMarker(currentVal: string[] | undefined): string[] | undefined {
    return isAllMarker(currentVal) ? undefined : currentVal;
  }

  /**
   * The "All" marker is mutually exclusive with concrete values. If both arrive
   * together, keep the concrete picks so the marker never leaks as a literal.
   */
  private normalizeAllSelection(value: string[]): string[] {
    if (value.length > 1 && value.includes(ALL_OPTION_VALUE)) {
      return value.filter((v) => v !== ALL_OPTION_VALUE);
    }
    return value;
  }

  private buildVariable(id: string, input: DistributiveOmit<Variable, 'id' | 'current'>): Variable {
    const base = {
      id,
      name: input.name,
      label: input.label,
      type: input.type,
      current: undefined,
      hide: input.hide,
      description: input.description,
    };

    const optionMeta = {
      multi: input.multi,
      includeAll: input.includeAll,
      customAllValue: input.customAllValue,
      allowCustomValue: input.allowCustomValue,
      sort: input.sort,
    };

    switch (input.type) {
      case VariableType.Query: {
        const v = input as DistributiveOmit<QueryVariable, 'id' | 'current'>;
        const shared = {
          ...base,
          ...optionMeta,
          type: VariableType.Query as const,
          regex: v.regex,
          useTimeFilter: v.useTimeFilter ?? false,
        };

        if (v.sourceKind === 'prometheusResource') {
          return {
            ...shared,
            sourceKind: v.sourceKind,
            language: 'PROMQL',
            dataset: v.dataset,
            promQLResourceQuery: v.promQLResourceQuery,
          };
        }
        return {
          ...shared,
          sourceKind: 'queryResult',
          language: v.language,
          query: v.query ?? '',
          dataset: v.dataset,
          valueField: v.valueField,
          labelField: v.labelField,
        };
      }
      case VariableType.Custom: {
        const v = input as Omit<CustomVariable, 'id' | 'current'>;
        return {
          ...base,
          ...optionMeta,
          type: VariableType.Custom,
          customOptions: this.normalizeCustomOptions(v.customOptions),
        } as CustomVariable;
      }
      case VariableType.Text: {
        return {
          ...base,
          type: VariableType.Text,
        } as TextVariable;
      }
      default:
        return { ...base, ...optionMeta } as Variable;
    }
  }

  private async fetchOptionsForVariableWithType(
    variable: Exclude<QueryVariable, { sourceKind: 'prometheusResource' }>,
    query: string,
    signal?: AbortSignal
  ): Promise<VariableQueryResult> {
    if (!this.dataPlugin) {
      throw new Error('VariableService not initialized with dataPlugin');
    }
    return executeVariableQuery(
      this.dataPlugin,
      { query, language: variable.language, dataset: variable.dataset },
      signal,
      variable.useTimeFilter ?? false
    );
  }

  private generateId(): string {
    return uuidv4();
  }

  /** Persist definitions and selected values, then commit the successful save. */
  private async saveVariables(variables: Variable[]): Promise<void> {
    if (!this.savedObjectsClient) {
      throw new Error('SavedObjectsClient is not initialized');
    }
    // Dashboard must be saved before adding/updating variables
    if (!this.dashboardId) {
      throw new Error('Dashboard must be saved before adding variables');
    }

    // An empty string removes variablesJSON from the saved object.
    const normalizedVariables = variables.map((variable) =>
      this.normalizeVariableForPersistence(variable)
    );
    const variablesJSON =
      normalizedVariables.length > 0 ? JSON.stringify({ variables: normalizedVariables }) : '';
    await this.savedObjectsClient.update('dashboard', this.dashboardId, {
      variablesJSON,
    });
    this.setVariables(normalizedVariables);
  }

  public destroy(): void {
    this.stopRefreshScheduler();
    this.queryExecutions.forEach((execution) => execution.controller?.abort());
    this.queryExecutions.clear();
    this.variables$.complete();
    this.dashboardId = undefined;
    this.savedObjectsClient = undefined;
  }
}
