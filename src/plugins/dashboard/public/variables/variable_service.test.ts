/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VariableService } from './variable_service';
import {
  Variable,
  VariableType,
  VariableSortOrder,
  VariableWithState,
  CustomVariable,
  QueryVariable,
  TextVariable,
  DistributiveOmit,
} from './types';
import { VariableInterpolationService } from './variable_interpolation_service';
import { BehaviorSubject, Subject } from 'rxjs';
import { TimeRange } from '../../../data/public';

jest.mock('./variable_query_utils', () => ({
  ...jest.requireActual('./variable_query_utils'),
  executeVariableQuery: jest.fn(),
}));

jest.mock('./promql_variable_query_utils', () => ({
  ...jest.requireActual('./promql_variable_query_utils'),
  executePromQLResourceQuery: jest.fn(),
}));

import { executeVariableQuery } from './variable_query_utils';
import { executePromQLResourceQuery } from './promql_variable_query_utils';
const mockExecuteVariableQuery = executeVariableQuery as jest.Mock;
const mockExecutePromQLResourceQuery = executePromQLResourceQuery as jest.Mock;

function makeQueryResult(
  values: unknown[],
  field: string = 'service',
  optionType: 'string' | 'number' | 'boolean' = 'string'
) {
  return values.length > 0
    ? {
        rows: values.map((value) => ({ [field]: value })),
        fields: [field],
        fieldTypes: { [field]: optionType },
      }
    : { rows: [], fields: [], fieldTypes: {} };
}

const DEFAULT_TIME: TimeRange = { from: 'now-15m', to: 'now' };

interface SchedulerControls {
  time$: BehaviorSubject<TimeRange | undefined>;
  reload$: Subject<void>;
  stop: () => void;
}
const schedulers = new WeakMap<VariableService, SchedulerControls>();
const services = new Set<VariableService>();

/** Starts the refresh scheduler with a controllable time range and reload trigger. */
function startScheduler(service: VariableService, time: TimeRange = DEFAULT_TIME) {
  const time$ = new BehaviorSubject<TimeRange | undefined>(time);
  const reload$ = new Subject<void>();
  const stop = service.startRefreshScheduler({ time$, reload$ });
  const controls = { time$, reload$, stop };
  schedulers.set(service, controls);
  return controls;
}

/**
 * Refreshes every query variable and waits for the cascade to finish: the
 * first call starts the scheduler (initial load), later calls request a reload.
 */
async function refresh(service: VariableService): Promise<void> {
  const controls = schedulers.get(service);
  if (controls) controls.reload$.next();
  else startScheduler(service);
  await service.whenSettled();
}

/** Starts the scheduler, waits for the initial load, and clears the query mocks' call history. */
async function startLoaded(service: VariableService) {
  const controls = startScheduler(service);
  await service.whenSettled();
  mockExecuteVariableQuery.mockClear();
  mockExecutePromQLResourceQuery.mockClear();
  return controls;
}

/** Lets scheduled requests and their promise continuations run. */
const flushTasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Controls query I/O without making the transport honor cancellation. */
function deferQueries() {
  const pending: Array<{
    query: string;
    signal?: AbortSignal;
    resolve: (values: string[]) => void;
  }> = [];
  mockExecuteVariableQuery.mockImplementation(
    (_data: unknown, { query }: { query: string }, signal?: AbortSignal) =>
      new Promise((resolve) =>
        pending.push({ query, signal, resolve: (values) => resolve(makeQueryResult(values)) })
      )
  );
  return pending;
}

/** Changes the time range seen by the scheduler and waits for the cascade to finish. */
async function changeTime(service: VariableService, time: TimeRange): Promise<void> {
  (schedulers.get(service) ?? startScheduler(service)).time$.next(time);
  await service.whenSettled();
}

function createService(
  initialVariables: Variable[] = [],
  dashboardId?: string,
  dataPlugin: any = {}
) {
  const mockSavedObjectsClient = {
    update: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockResolvedValue({ attributes: {} }),
  };

  const telemetrySink = jest.fn();

  const service = new VariableService(
    dataPlugin === null ? undefined : dataPlugin,
    dashboardId,
    mockSavedObjectsClient as any,
    telemetrySink
  );
  services.add(service);

  service.initialize(initialVariables);

  return { service, mockSavedObjectsClient, telemetrySink };
}

/** Minimal dataPlugin stub exposing the timefilter path read by the PromQL branch. */
function makeDataPluginStub(getTime: () => any = () => ({ from: 'now-15m', to: 'now' })) {
  return {
    query: {
      timefilter: {
        timefilter: {
          getTime: jest.fn(getTime),
        },
      },
    },
  };
}

function makeCustomVariable(overrides: Partial<CustomVariable> = {}): CustomVariable {
  return {
    id: 'custom-1',
    name: 'env',
    type: VariableType.Custom,
    current: ['dev'],
    customOptions: ['dev', 'staging', 'prod'],
    ...overrides,
  };
}

function makeTextVariable(overrides: Partial<TextVariable> = {}): TextVariable {
  return {
    id: 'text-1',
    name: 'keyword',
    type: VariableType.Text,
    current: undefined,
    ...overrides,
  };
}

function getOptionValues(options: Array<{ value: string }>): string[] {
  return options.map((option) => option.value);
}

// Helper function to get current values
function getCurrentValues(service: VariableService): Record<string, string[]> {
  const variables = service.getVariables();
  const values: Record<string, string[]> = {};
  variables.forEach((v) => {
    values[v.name] = v.current ?? [];
  });
  return values;
}

function makeQueryVariable(overrides: Partial<QueryVariable> = {}): QueryVariable {
  return {
    id: 'query-1',
    name: 'service',
    type: VariableType.Query,
    current: ['api'],
    sourceKind: 'queryResult',
    query: 'source=logs | dedup service | fields service',
    language: 'PPL',
    ...overrides,
  } as QueryVariable;
}

describe('VariableService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteVariableQuery.mockReset().mockResolvedValue(makeQueryResult([]));
    mockExecutePromQLResourceQuery.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    services.forEach((service) => service.destroy());
    services.clear();
    jest.restoreAllMocks();
  });

  describe('initialize and getVariables', () => {
    it('should return empty array when not initialized', () => {
      const service = new VariableService();
      expect(service.getVariables()).toEqual([]);
      service.destroy();
    });
  });

  describe('getVariablesWithState', () => {
    it('publishes derived custom options while keeping definitions free of execution fields', () => {
      const variable = makeCustomVariable({
        customOptions: ['dev', { value: 'prod', label: 'Production' }],
      });
      const { service } = createService([variable]);
      const listener = jest.fn();
      const subscription = service.getVariables$().subscribe(listener);

      expect(service.getVariables()).toEqual([variable]);
      expect(listener).toHaveBeenCalledWith([
        {
          ...variable,
          options: [{ value: 'dev' }, { value: 'prod', label: 'Production' }],
          loading: false,
        },
      ]);
      expect(service.getVariablesWithState()).toEqual(listener.mock.calls[0][0]);
      subscription.unsubscribe();
    });

    it('publishes pending variables before their initial options are fetched', async () => {
      let resolveOptions!: (result: ReturnType<typeof makeQueryResult>) => void;
      mockExecuteVariableQuery.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOptions = resolve;
        })
      );
      const { service } = createService([
        makeQueryVariable({ multi: true, includeAll: true, current: ['$__all'] }),
      ]);
      startScheduler(service);
      const readyOptions: string[][] = [];
      const subscription = service.getVariables$().subscribe((variables) => {
        if (!variables.some((variable) => variable.loading)) {
          readyOptions.push(getOptionValues(variables[0].options));
        }
      });

      try {
        await flushTasks();
        expect(readyOptions).toEqual([]);
      } finally {
        resolveOptions(makeQueryResult(['api', 'web']));
        await service.whenSettled();
        subscription.unsubscribe();
        service.destroy();
      }
      expect(readyOptions).toEqual([['api', 'web']]);
    });
  });

  describe('addVariable — Custom', () => {
    it('should add a custom variable with derived options', async () => {
      const { service } = createService([], 'dashboard-123');

      await service.addVariable({
        name: 'env',
        type: VariableType.Custom,
        customOptions: ['dev', 'staging', 'prod'],
      } as any);

      const vars = service.getVariables();
      expect(vars).toHaveLength(1);
      expect(vars[0].name).toBe('env');
      expect(vars[0].current).toEqual(['dev']);
      expect((vars[0] as CustomVariable).customOptions).toEqual([
        { value: 'dev' },
        { value: 'staging' },
        { value: 'prod' },
      ]);

      // The published options are derived from the saved definition.
      const withState = service.getVariablesWithState();
      expect(getOptionValues(withState[0].options)).toEqual(['dev', 'staging', 'prod']);
    });

    it('should persist normalized custom option objects', async () => {
      const { service, mockSavedObjectsClient } = createService([], 'dashboard-123');

      await service.addVariable({
        name: 'region',
        type: VariableType.Custom,
        customOptions: [{ value: 'us-east-1', label: 'US East' }, 'us-west-2'],
      } as any);

      const [{ variablesJSON }] = mockSavedObjectsClient.update.mock.calls[0].slice(2);
      const parsed = JSON.parse(variablesJSON);
      expect(parsed.variables[0].customOptions).toEqual([
        { value: 'us-east-1', label: 'US East' },
        { value: 'us-west-2' },
      ]);
    });
  });

  describe('addVariable — Query', () => {
    it('loads an added query variable once and keeps it pending until its options arrive', async () => {
      const { service } = createService([], 'dashboard-123');
      await startLoaded(service);
      const pending = deferQueries();

      await service.addVariable({
        name: 'service',
        type: VariableType.Query,
        sourceKind: 'queryResult',
        query: 'source=logs | dedup service | fields service',
        language: 'PPL',
      } as any);
      await flushTasks();
      expect(pending.map((request) => request.query)).toEqual([
        'source=logs | dedup service | fields service',
      ]);
      expect(service.getVariablesWithState()[0].loading).toBe(true);
      expect(service.getVariables()[0].current).toBeUndefined();

      pending[0].resolve(['api', 'web', 'worker']);
      await service.whenSettled();
      expect(service.getVariablesWithState()[0]).toMatchObject({
        current: ['api'],
        options: [{ value: 'api' }, { value: 'web' }, { value: 'worker' }],
        loading: false,
      });
    });

    it('should persist promQLResourceQuery when adding a PromQL resource query variable (regression)', async () => {
      mockExecutePromQLResourceQuery.mockResolvedValue(['node', 'job']);
      const { service } = createService([], 'dashboard-123', makeDataPluginStub());
      await startLoaded(service);

      await service.addVariable({
        name: 'instance',
        type: VariableType.Query,
        language: 'PROMQL',
        dataset: { id: 'ds-1' } as any,
        sourceKind: 'prometheusResource' as const,
        promQLResourceQuery: { kind: 'labelValues', label: 'instance' },
      } as any);
      await service.whenSettled();

      const saved = service.getVariables()[0] as Extract<
        QueryVariable,
        { sourceKind: 'prometheusResource' }
      >;
      // buildVariable previously whitelisted fields and silently dropped
      // promQLResourceQuery — this asserts it round-trips through addVariable.
      expect(saved.promQLResourceQuery).toEqual({ kind: 'labelValues', label: 'instance' });
      expect(mockExecutePromQLResourceQuery).toHaveBeenCalledWith(
        expect.anything(),
        'ds-1',
        { kind: 'labelValues', label: 'instance' },
        undefined
      );
    });
  });

  describe('updateVariable — same type', () => {
    it('should update label without touching current', async () => {
      const { service } = createService([makeCustomVariable()], 'dashboard-123');

      await service.updateVariable('custom-1', { label: 'Environment' });

      const updated = service.getVariables()[0];
      expect(updated.label).toBe('Environment');
      expect(updated.current).toEqual(['dev']);
      expect((updated as CustomVariable).customOptions).toEqual([
        { value: 'dev' },
        { value: 'staging' },
        { value: 'prod' },
      ]);
    });

    it('should preserve current if still valid after customOptions change', async () => {
      const { service } = createService(
        [makeCustomVariable({ current: ['staging'] })],
        'dashboard-123'
      );

      await service.updateVariable('custom-1', {
        customOptions: ['dev', 'staging', 'new'],
      } as any);

      const withState = service.getVariablesWithState();
      expect(withState[0].current).toEqual(['staging']);
    });

    it('should preserve the "All" marker when customOptions change', async () => {
      const { service } = createService(
        [makeCustomVariable({ multi: true, includeAll: true, current: ['$__all'] })],
        'dashboard-123'
      );

      await service.updateVariable('custom-1', {
        customOptions: ['dev', 'staging', 'prod', 'new'],
      } as any);

      const withState = service.getVariablesWithState();
      // Marker is kept so "All" still tracks the new option list, not reset to 'dev'.
      expect(withState[0].current).toEqual(['$__all']);
    });

    it('should preserve current by value when custom option labels change', async () => {
      const { service } = createService(
        [
          makeCustomVariable({
            current: ['us-west-2'],
            customOptions: [
              { value: 'us-east-1', label: 'US East' },
              { value: 'us-west-2', label: 'US West' },
            ],
          }),
        ],
        'dashboard-123'
      );

      await service.updateVariable('custom-1', {
        customOptions: [
          { value: 'us-east-1', label: 'US East 1' },
          { value: 'us-west-2', label: 'US West 2' },
        ],
      } as any);

      const withState = service.getVariablesWithState();
      expect(withState[0].current).toEqual(['us-west-2']);
      expect(withState[0].options).toEqual([
        { value: 'us-east-1', label: 'US East 1' },
        { value: 'us-west-2', label: 'US West 2' },
      ]);
    });

    it('should reset invalid current by value even when labels match', async () => {
      const { service } = createService(
        [
          makeCustomVariable({
            current: ['old-value'],
            customOptions: [{ value: 'old-value', label: 'Shared label' }],
          }),
        ],
        'dashboard-123'
      );

      await service.updateVariable('custom-1', {
        customOptions: [{ value: 'new-value', label: 'Shared label' }],
      } as any);

      const withState = service.getVariablesWithState();
      expect(withState[0].current).toEqual(['new-value']);
    });

    it('keeps a typed off-list selection when the option values are unchanged', async () => {
      const { service } = createService(
        [makeCustomVariable({ current: ['typed-value'], allowCustomValue: true })],
        'dashboard-123'
      );

      await service.updateVariable('custom-1', {
        customOptions: ['dev', 'staging', 'prod'],
      } as any);

      const withState = service.getVariablesWithState();
      expect(withState[0].current).toEqual(['typed-value']);
    });

    it('should keep current as-is when switching from single to multi', async () => {
      const { service } = createService(
        [makeCustomVariable({ multi: false, current: ['dev'] })],
        'dashboard-123'
      );

      await service.updateVariable('custom-1', { multi: true });

      const updated = service.getVariables()[0];
      expect(updated.multi).toBe(true);
      expect(updated.current).toEqual(['dev']);
    });

    it('should refresh query options when valueField changes', async () => {
      mockExecuteVariableQuery.mockResolvedValue({
        rows: [{ service_id: 'svc-1', service_name: 'API service' }],
        fields: ['service_id', 'service_name'],
        fieldTypes: { service_id: 'string', service_name: 'string' },
      });
      const { service } = createService(
        [
          makeQueryVariable({
            current: ['svc-1'],
            valueField: 'service_id',
          }),
        ],
        'dashboard-123'
      );
      await startLoaded(service);

      await service.updateVariable('query-1', { valueField: 'service_name' });
      await service.whenSettled();

      expect(mockExecuteVariableQuery).toHaveBeenCalledTimes(1);
      expect(service.getVariablesWithState()[0].options).toEqual([{ value: 'API service' }]);
    });

    it('should refresh query option labels when labelField changes', async () => {
      mockExecuteVariableQuery.mockResolvedValue({
        rows: [{ service_id: 'svc-1', service_name: 'API service' }],
        fields: ['service_id', 'service_name'],
        fieldTypes: { service_id: 'string', service_name: 'string' },
      });
      const { service } = createService(
        [
          makeQueryVariable({
            current: ['svc-1'],
            valueField: 'service_id',
          }),
        ],
        'dashboard-123'
      );
      await startLoaded(service);

      await service.updateVariable('query-1', { labelField: 'service_name' });
      await service.whenSettled();

      expect(mockExecuteVariableQuery).toHaveBeenCalledTimes(1);
      expect(service.getVariablesWithState()[0].options).toEqual([
        { value: 'svc-1', label: 'API service' },
      ]);
    });

    it('should refresh options when promQLResourceQuery changes', async () => {
      mockExecutePromQLResourceQuery.mockResolvedValue(['job']);
      const { service } = createService(
        [
          makeQueryVariable({
            language: 'PROMQL',
            dataset: { id: 'ds-1' } as any,
            sourceKind: 'prometheusResource' as const,
            promQLResourceQuery: { kind: 'labelNames' },
          }),
        ],
        'dashboard-123',
        makeDataPluginStub()
      );
      await startLoaded(service);

      // Only promQLResourceQuery changes — no other trigger field (query/language/dataset/etc.) is touched.
      await service.updateVariable('query-1', {
        sourceKind: 'prometheusResource' as const,
        promQLResourceQuery: { kind: 'metrics', metricRegex: 'node_.*' },
      });
      await service.whenSettled();

      expect(mockExecutePromQLResourceQuery).toHaveBeenCalledTimes(1);
      expect(mockExecutePromQLResourceQuery).toHaveBeenCalledWith(
        expect.anything(),
        'ds-1',
        { kind: 'metrics', metricRegex: 'node_.*' },
        undefined
      );
    });
  });

  describe('updateVariable — type switch', () => {
    it('should strip query fields when switching from Query to Custom', async () => {
      const { service } = createService([makeQueryVariable()], 'dashboard-123');

      await service.updateVariable('query-1', {
        type: VariableType.Custom,
        customOptions: ['a', 'b', 'c'],
      } as any);

      const updated = service.getVariables()[0];
      expect(updated.type).toBe(VariableType.Custom);
      expect((updated as CustomVariable).customOptions).toEqual([
        { value: 'a' },
        { value: 'b' },
        { value: 'c' },
      ]);
      expect(updated.current).toEqual(['a']);
      expect((updated as any).query).toBeUndefined();
      expect((updated as any).language).toBeUndefined();
    });

    it('should persist promQLResourceQuery when switching from Custom to a PromQL Query variable (regression)', async () => {
      mockExecutePromQLResourceQuery.mockResolvedValue(['up']);
      const { service } = createService(
        [makeCustomVariable()],
        'dashboard-123',
        makeDataPluginStub()
      );
      await startLoaded(service);

      await service.updateVariable('custom-1', {
        type: VariableType.Query,
        language: 'PROMQL',
        dataset: { id: 'ds-1' } as any,
        sourceKind: 'prometheusResource' as const,
        promQLResourceQuery: { kind: 'metrics', metricRegex: 'node_.*' },
      } as any);
      await service.whenSettled();

      const updated = service.getVariables()[0] as Extract<
        QueryVariable,
        { sourceKind: 'prometheusResource' }
      >;
      expect(updated.promQLResourceQuery).toEqual({ kind: 'metrics', metricRegex: 'node_.*' });
      expect(mockExecutePromQLResourceQuery).toHaveBeenCalled();
    });
  });

  describe('saving while the scheduler runs', () => {
    function isLoading(service: VariableService, id: string) {
      return service.getVariablesWithState().find((v) => v.id === id)?.loading;
    }

    it('keeps the refresh started by a save loading, so dependents wait for it', async () => {
      const a = makeCustomVariable({
        id: 'a',
        name: 'a',
        customOptions: ['old'],
        current: ['old'],
      });
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb $a', current: undefined });
      const { service } = createService([a, b], 'dashboard-123');
      service.setInterpolationService(
        new VariableInterpolationService(() => service.getVariablesWithState())
      );
      await startLoaded(service);
      const pending = deferQueries();

      await service.updateVariable('a', {
        type: VariableType.Query,
        query: 'qa',
        language: 'PPL',
      } as any);
      await flushTasks();

      // Saving the definition must leave its newly started query pending.
      expect(isLoading(service, 'a')).toBe(true);
      expect(service.getVariables()[0].type).toBe(VariableType.Query);
      expect(service.getVariables()[0]).not.toHaveProperty('customOptions');
      expect(pending.map((p) => p.query)).toEqual(['qa']);
      expect(isLoading(service, 'b')).toBe(true);

      pending[0].resolve(['x']);
      await flushTasks();
      expect(pending.map((p) => p.query)).toEqual(['qa', 'qb x']);
      pending[1].resolve(['y']);
      await service.whenSettled();
      expect(service.getVariablesWithState().every((variable) => !variable.loading)).toBe(true);
    });

    it('keeps the new options when one save changes both the query and the sort', async () => {
      mockExecuteVariableQuery.mockResolvedValue(makeQueryResult(['old']));
      const { service } = createService([makeQueryVariable({ current: ['old'] })], 'dashboard-123');
      await startLoaded(service);
      const pending = deferQueries();

      await service.updateVariable('query-1', {
        query: 'source=other | fields service',
        sort: VariableSortOrder.AlphabeticalDesc,
      } as any);
      await flushTasks();
      expect(isLoading(service, 'query-1')).toBe(true);

      pending[0].resolve(['a', 'c', 'b']);
      await service.whenSettled();

      const state = service.getVariablesWithState()[0];
      expect(state.loading).toBe(false);
      expect(getOptionValues(state.options)).toEqual(['c', 'b', 'a']);
    });

    it('does not clear the loading flag of a refresh that starts while the save is in flight', async () => {
      const q = makeQueryVariable({ id: 'q', name: 'q', query: 'qq', useTimeFilter: true });
      const d = makeQueryVariable({ id: 'd', name: 'd', query: 'qd $q', current: undefined });
      const { service, mockSavedObjectsClient } = createService([q, d], 'dashboard-123');
      service.setInterpolationService(
        new VariableInterpolationService(() => service.getVariablesWithState())
      );
      const { time$ } = await startLoaded(service);
      const pending = deferQueries();

      let resolveSave!: () => void;
      mockSavedObjectsClient.update.mockImplementationOnce(
        () => new Promise((resolve) => (resolveSave = () => resolve({})))
      );
      const save = service.updateVariable('q', { sort: VariableSortOrder.AlphabeticalDesc });

      // A refresh unrelated to the save starts before the save returns.
      time$.next({ from: 'now-1h', to: 'now' });
      await flushTasks();
      expect(pending.map((p) => p.query)).toEqual(['qq']);

      resolveSave();
      await save;
      await flushTasks();
      expect(isLoading(service, 'q')).toBe(true);
      expect(pending.map((p) => p.query)).toEqual(['qq']);

      pending[0].resolve(['a', 'c', 'b']);
      await service.whenSettled();

      // q keeps its current value, so d's query is unchanged and d never re-queries.
      expect(pending).toHaveLength(1);
      expect(getOptionValues(service.getVariablesWithState()[0].options)).toEqual(['c', 'b', 'a']);
    });

    it('sorts a refresh result by the sort saved while the refresh was in flight', async () => {
      const { service } = createService([makeQueryVariable({ current: ['a'] })], 'dashboard-123');
      const { reload$ } = await startLoaded(service);
      const pending = deferQueries();

      reload$.next();
      await flushTasks();
      expect(pending).toHaveLength(1);

      await service.updateVariable('query-1', { sort: VariableSortOrder.AlphabeticalDesc });
      pending[0].resolve(['a', 'c', 'b']);
      await service.whenSettled();

      expect(getOptionValues(service.getVariablesWithState()[0].options)).toEqual(['c', 'b', 'a']);
    });
  });

  describe('updateVariable — errors', () => {
    it('should throw for unknown id', async () => {
      const { service } = createService([makeCustomVariable()]);
      await expect(service.updateVariable('nonexistent', {})).rejects.toThrow('not found');
    });
  });

  describe('removeVariable', () => {
    it('should remove a variable by id', async () => {
      const { service } = createService(
        [makeCustomVariable(), makeQueryVariable()],
        'dashboard-123'
      );
      await service.removeVariable('custom-1');
      expect(service.getVariables()).toHaveLength(1);
      expect(service.getVariables()[0].id).toBe('query-1');
    });

    it('should not remove variable if save fails', async () => {
      const { service, mockSavedObjectsClient } = createService(
        [makeCustomVariable(), makeQueryVariable()],
        'dashboard-123'
      );
      mockSavedObjectsClient.update.mockRejectedValueOnce(new Error('Save failed'));

      await expect(service.removeVariable('custom-1')).rejects.toThrow('Save failed');

      // Variables should still have both items
      expect(service.getVariables()).toHaveLength(2);
    });

    it('should use empty string when removing last variable', async () => {
      const { service, mockSavedObjectsClient } = createService(
        [makeCustomVariable()],
        'dashboard-123'
      );
      await service.removeVariable('custom-1');

      expect(service.getVariables()).toHaveLength(0);
      // Verify that empty string (not undefined) was passed to savedObjectsClient.update
      // This ensures the variablesJSON field is cleared from the saved object
      expect(mockSavedObjectsClient.update).toHaveBeenCalledWith('dashboard', 'dashboard-123', {
        variablesJSON: '',
      });
    });
  });

  describe('updateVariableValue', () => {
    it('should drop the "All" marker when concrete values are also present', () => {
      const { service } = createService([
        makeCustomVariable({ multi: true, includeAll: true, current: ['$__all'] }),
      ]);
      // A mixed ['$__all', 'p99'] must never persist, or '$__all' leaks as a literal.
      service.updateVariableValue('custom-1', ['$__all', 'p99']);
      expect(service.getVariables()[0].current).toEqual(['p99']);
    });

    it('should throw for unknown id', () => {
      const { service } = createService([makeCustomVariable()]);
      expect(() => service.updateVariableValue('nonexistent', ['x'])).toThrow('not found');
    });

    it('should partially interpolate when some variables are before and some after', async () => {
      mockExecuteVariableQuery.mockResolvedValue(makeQueryResult(['result-1', 'result-2']));

      // Variable order: varA, varC (depends on varA and varB), varB
      const varA = makeCustomVariable({ id: 'var-a', name: 'varA', current: ['value-a'] });
      const varC = makeQueryVariable({
        id: 'var-c',
        name: 'varC',
        query: "source=logs | where fieldA = '${varA}' AND fieldB = '${varB}'",
      });
      const varB = makeCustomVariable({ id: 'var-b', name: 'varB', current: ['value-b'] });
      const { service } = createService([varA, varC, varB]);

      // Set up interpolation service
      const interpolationService = new VariableInterpolationService(() =>
        service.getVariablesWithState()
      );
      service.setInterpolationService(interpolationService);

      mockExecuteVariableQuery.mockClear();
      await refresh(service);

      // varC should be refreshed with varA interpolated but varB kept as placeholder
      expect(mockExecuteVariableQuery).toHaveBeenCalledTimes(1);
      const calledQuery = mockExecuteVariableQuery.mock.calls[0][1].query;
      expect(calledQuery).toContain('value-a'); // varA interpolated
      expect(calledQuery).toContain('${varB}'); // varB kept as placeholder
    });
  });

  describe('fetching options', () => {
    it('should keep a value the user selected while the query was running', async () => {
      let resolveQuery: (value: any) => void = () => {};
      mockExecuteVariableQuery.mockImplementation(
        () => new Promise((resolve) => (resolveQuery = resolve))
      );
      const region = makeQueryVariable({
        id: 'region-1',
        name: 'region',
        query: 'region-query',
        current: ['CN'],
      });
      const { service } = createService([region]);

      startScheduler(service);
      await flushTasks();
      service.updateVariableValue('region-1', ['JP']);
      resolveQuery(makeQueryResult(['CN', 'JP'], 'region'));
      await service.whenSettled();

      expect(service.getVariables()[0].current).toEqual(['JP']);
    });

    it('should update options and preserve valid current', async () => {
      mockExecuteVariableQuery.mockResolvedValue(makeQueryResult(['api', 'web', 'new-svc']));
      const { service } = createService([makeQueryVariable({ current: ['api'] })]);

      await refresh(service);

      const withState = service.getVariablesWithState();
      expect(getOptionValues(withState[0].options)).toEqual(['api', 'web', 'new-svc']);
      expect(withState[0].current).toEqual(['api']);
      expect(withState[0].loading).toBe(false);
    });

    it.each([false, true])(
      'keeps off-list query selections when allowCustomValue is %s',
      async (allowCustomValue) => {
        mockExecuteVariableQuery.mockResolvedValue(makeQueryResult(['new-a', 'new-b']));
        const { service } = createService([
          makeQueryVariable({ current: ['old-value'], allowCustomValue }),
        ]);

        await refresh(service);
        expect(service.getVariables()[0].current).toEqual(['old-value']);
      }
    );

    it('uses configured fields, regex and numeric metadata to build options and the default selection', async () => {
      mockExecuteVariableQuery.mockResolvedValue({
        rows: [
          { product_name: 'Other label', product_id: 120 },
          { product_name: '120 label', product_id: 223 },
        ],
        fields: ['product_name', 'product_id'],
        fieldTypes: { product_name: 'string', product_id: 'number' },
      });
      const { service } = createService([
        makeQueryVariable({
          current: undefined,
          valueField: 'product_id',
          labelField: 'product_name',
          regex: '^1',
        }),
      ]);

      await refresh(service);

      const withState = service.getVariablesWithState();
      expect(withState[0]).toMatchObject({
        options: [{ value: '120', label: 'Other label' }],
        optionType: 'number',
        current: ['120'],
        loading: false,
      });
    });

    it('should extract query option values and labels with regex capture groups', async () => {
      mockExecuteVariableQuery.mockResolvedValue({
        rows: [{ service: 'env=prod,label=Production' }, { service: 'env=dev,label=Development' }],
        fields: ['service'],
        fieldTypes: { service: 'string' },
      });
      const { service } = createService([
        makeQueryVariable({
          current: undefined,
          regex: '^env=(?<value>[^,]+),label=(?<label>.+)$',
        }),
      ]);

      await refresh(service);

      const withState = service.getVariablesWithState();
      expect(withState[0].options).toEqual([
        { value: 'prod', label: 'Production' },
        { value: 'dev', label: 'Development' },
      ]);
      expect(service.getVariables()[0].current).toEqual(['prod']);
    });
  });

  describe('fetching options — PromQL resource query', () => {
    it('fetches resource options through the PromQL client and applies the configured regex', async () => {
      mockExecutePromQLResourceQuery.mockResolvedValue(['instance', 'job', 'node']);
      const dataPlugin = makeDataPluginStub();
      const { service } = createService(
        [
          makeQueryVariable({
            current: undefined,
            language: 'PROMQL',
            dataset: { id: 'ds-1' } as any,
            sourceKind: 'prometheusResource' as const,
            promQLResourceQuery: { kind: 'labelNames' },
            regex: '^job$',
          }),
        ],
        undefined,
        dataPlugin
      );

      await refresh(service);

      expect(mockExecutePromQLResourceQuery).toHaveBeenCalledTimes(1);
      expect(mockExecutePromQLResourceQuery).toHaveBeenCalledWith(
        dataPlugin,
        'ds-1',
        { kind: 'labelNames' },
        undefined // useTimeFilter defaults to false — no time range passed
      );
      expect(mockExecuteVariableQuery).not.toHaveBeenCalled();

      const withState = service.getVariablesWithState();
      expect(getOptionValues(withState[0].options)).toEqual(['job']);
      expect(withState[0].current).toEqual(['job']);
      expect(withState[0].optionType).toBe('string');
      expect(withState[0].loading).toBe(false);
    });

    it('should pass the resolved time range when useTimeFilter is enabled', async () => {
      mockExecutePromQLResourceQuery.mockResolvedValue(['up']);
      const timeRange = { from: 'now-1h', to: 'now' };
      const dataPlugin = makeDataPluginStub(() => timeRange);
      const { service } = createService(
        [
          makeQueryVariable({
            language: 'PROMQL',
            dataset: { id: 'ds-1' } as any,
            sourceKind: 'prometheusResource' as const,
            promQLResourceQuery: { kind: 'metrics', metricRegex: 'node_.*' },
            useTimeFilter: true,
          }),
        ],
        undefined,
        dataPlugin
      );

      await refresh(service);

      expect(mockExecutePromQLResourceQuery).toHaveBeenCalledWith(
        dataPlugin,
        'ds-1',
        { kind: 'metrics', metricRegex: 'node_.*' },
        timeRange
      );
    });

    it('executes a free-text PROMQL variable through the query-result path', async () => {
      mockExecuteVariableQuery.mockResolvedValue(makeQueryResult(['svc-1']));
      const { service } = createService(
        [
          makeQueryVariable({
            language: 'PROMQL',
            dataset: { id: 'ds-1' } as any,
            query: 'up',
          }),
        ],
        undefined,
        makeDataPluginStub()
      );

      await refresh(service);

      expect(mockExecuteVariableQuery).toHaveBeenCalledTimes(1);
      expect(mockExecutePromQLResourceQuery).not.toHaveBeenCalled();
    });

    it('should set error state when PromQL resource query fails', async () => {
      mockExecutePromQLResourceQuery.mockRejectedValue(new Error('resource endpoint 403'));
      const { service } = createService(
        [
          makeQueryVariable({
            language: 'PROMQL',
            dataset: { id: 'ds-1' } as any,
            sourceKind: 'prometheusResource' as const,
            promQLResourceQuery: { kind: 'series', matcher: 'up' },
          }),
        ],
        undefined,
        makeDataPluginStub()
      );

      await refresh(service);

      const withState = service.getVariablesWithState();
      expect(withState[0].loading).toBe(false);
      expect(withState[0].error).toBe('resource endpoint 403');
    });

    it('should throw and record an error when dataPlugin is not initialized', async () => {
      const { service } = createService(
        [
          makeQueryVariable({
            language: 'PROMQL',
            dataset: { id: 'ds-1' } as any,
            sourceKind: 'prometheusResource' as const,
            promQLResourceQuery: { kind: 'labelNames' },
          }),
        ],
        undefined,
        null // explicitly no dataPlugin
      );

      await refresh(service);

      const withState = service.getVariablesWithState();
      expect(withState[0].error).toBe('VariableService not initialized with dataPlugin');
      expect(mockExecutePromQLResourceQuery).not.toHaveBeenCalled();
    });

    it('keeps a newer PromQL request loading when a superseded request fails', async () => {
      let rejectStale!: (error: Error) => void;
      let resolveFresh!: (values: string[]) => void;
      mockExecutePromQLResourceQuery
        .mockReturnValueOnce(
          new Promise<string[]>((_, reject) => {
            rejectStale = reject;
          })
        )
        .mockReturnValueOnce(
          new Promise<string[]>((resolve) => {
            resolveFresh = resolve;
          })
        );
      const { service, telemetrySink } = createService(
        [
          makeQueryVariable({
            language: 'PROMQL',
            dataset: { id: 'ds-1', title: 'Prometheus', type: 'PROMETHEUS' },
            sourceKind: 'prometheusResource',
            promQLResourceQuery: { kind: 'labelNames' },
          }),
        ],
        undefined,
        makeDataPluginStub()
      );
      const { reload$ } = startScheduler(service);
      await flushTasks();
      reload$.next();
      await flushTasks();

      try {
        rejectStale(new Error('stale failure'));
        await flushTasks();
        expect(service.getVariablesWithState()[0]).toMatchObject({
          loading: true,
          error: undefined,
        });
        expect(telemetrySink).not.toHaveBeenCalledWith({
          name: 'variable_query_failed',
          data: expect.anything(),
        });

        resolveFresh(['fresh']);
        await service.whenSettled();
        expect(getOptionValues(service.getVariablesWithState()[0].options)).toEqual(['fresh']);
      } finally {
        resolveFresh(['fresh']);
        await service.whenSettled();
        service.destroy();
      }
    });

    it('should not let a stale cascade refresh overwrite the persisted current value', async () => {
      // region (upstream) -> service (PromQL labelValues matcher referencing ${region}).
      // Each region change re-queries service and aborts the previous query; the
      // aborted ones resolve after the newest one.
      const deferreds: Array<{ resolve: (values: string[]) => void }> = [];
      mockExecutePromQLResourceQuery.mockImplementation(
        () =>
          new Promise<string[]>((resolve) => {
            deferreds.push({ resolve });
          })
      );

      const region = makeCustomVariable({ id: 'region-1', name: 'region', current: ['us-east'] });
      const svc = makeQueryVariable({
        id: 'service-1',
        name: 'service',
        current: undefined,
        language: 'PROMQL',
        dataset: { id: 'ds-1' } as any,
        sourceKind: 'prometheusResource' as const,
        promQLResourceQuery: {
          kind: 'labelValues',
          label: 'instance',
          matchers: [{ label: 'region', operator: '=', value: '${region}' }],
        },
      });
      const { service } = createService([region, svc], undefined, makeDataPluginStub());
      service.setInterpolationService(
        new VariableInterpolationService(() => service.getVariablesWithState())
      );

      startScheduler(service);
      await flushTasks();
      service.updateVariableValue('region-1', ['stale']);
      await flushTasks();
      service.updateVariableValue('region-1', ['fresh']);
      await flushTasks();

      expect(deferreds).toHaveLength(3);
      // The newest query resolves first, the aborted ones afterwards (out of order).
      deferreds[2].resolve(['fresh-instance']);
      deferreds[1].resolve(['stale-instance']);
      deferreds[0].resolve(['initial-instance']);
      await service.whenSettled();

      const withState = service.getVariablesWithState();
      const serviceVar = withState.find((v) => v.id === 'service-1')!;
      expect(getOptionValues(serviceVar.options)).toEqual(['fresh-instance']);
      // `current` was unset, so it defaults to the first option of the winning
      // request. It must reflect the fresh result, not the stale one.
      expect(service.getVariables().find((v) => v.id === 'service-1')!.current).toEqual([
        'fresh-instance',
      ]);
    });
  });

  describe('destroy', () => {
    it('aborts active requests, completes observers and ignores late results', async () => {
      const pending = deferQueries();
      const { service } = createService([makeQueryVariable({ current: undefined })]);
      const onSnapshot = jest.fn();
      const onComplete = jest.fn();
      service.getVariables$().subscribe({ next: onSnapshot, complete: onComplete });
      const { time$, reload$ } = startScheduler(service);
      await flushTasks();
      expect(pending).toHaveLength(1);

      service.destroy();
      expect(pending[0].signal?.aborted).toBe(true);
      expect(onComplete).toHaveBeenCalledTimes(1);
      onSnapshot.mockClear();

      pending[0].resolve(['late']);
      time$.next({ from: 'now-1h', to: 'now' });
      reload$.next();
      await flushTasks();
      expect(onSnapshot).not.toHaveBeenCalled();
      expect(service.getVariables()[0].current).toBeUndefined();
      expect(pending).toHaveLength(1);
    });
  });

  describe('setInterpolationService — chained variables', () => {
    it('should refresh a dependent PromQL resource query variable when the referenced variable changes', async () => {
      mockExecutePromQLResourceQuery.mockResolvedValue(['node']);
      const source = makeCustomVariable({ id: 'source-1', name: 'promsource', current: ['node'] });
      const promqlVar = makeQueryVariable({
        id: 'query-1',
        name: 'instance',
        language: 'PROMQL',
        dataset: { id: 'ds-1' } as any,
        sourceKind: 'prometheusResource' as const,
        promQLResourceQuery: { kind: 'labelValues', label: 'instance', metric: '${promsource}' },
      });
      const { service } = createService([source, promqlVar], undefined, makeDataPluginStub());
      service.setInterpolationService(
        new VariableInterpolationService(() => service.getVariablesWithState())
      );
      startScheduler(service);
      await service.whenSettled();
      expect(mockExecutePromQLResourceQuery).toHaveBeenLastCalledWith(
        expect.anything(),
        'ds-1',
        { kind: 'labelValues', label: 'instance', metric: 'node' },
        undefined
      );
      mockExecutePromQLResourceQuery.mockClear();

      service.updateVariableValue('source-1', ['different-source']);
      await service.whenSettled();

      expect(mockExecutePromQLResourceQuery).toHaveBeenCalledTimes(1);
      expect(mockExecutePromQLResourceQuery).toHaveBeenCalledWith(
        expect.anything(),
        'ds-1',
        { kind: 'labelValues', label: 'instance', metric: 'different-source' },
        undefined
      );
    });

    // Structured resource fields need raw substitution; the client escapes
    // selector values separately.
    it('should not regex-escape ${var} values substituted into Label filter label/value fields', async () => {
      mockExecutePromQLResourceQuery.mockResolvedValue(['ok']);
      const source = makeCustomVariable({ id: 'source-1', name: 'a', current: ['3.1.1'] });
      const promqlVar = makeQueryVariable({
        id: 'query-1',
        name: 'instance',
        language: 'PROMQL',
        dataset: { id: 'ds-1' } as any,
        sourceKind: 'prometheusResource' as const,
        promQLResourceQuery: {
          kind: 'labelValues',
          label: '${a}',
          matchers: [{ label: '${a}', operator: '=', value: '${a}' }],
        },
      });
      const { service } = createService([source, promqlVar], undefined, makeDataPluginStub());
      service.setInterpolationService(
        new VariableInterpolationService(() => service.getVariablesWithState())
      );

      await refresh(service);

      expect(mockExecutePromQLResourceQuery).toHaveBeenCalledWith(
        expect.anything(),
        'ds-1',
        {
          kind: 'labelValues',
          label: '3.1.1',
          matchers: [{ label: '3.1.1', operator: '=', value: '3.1.1' }],
        },
        undefined
      );
    });
  });

  describe('refresh scheduler', () => {
    /** Returns a service whose queries interpolate, as in the dashboard. */
    function createWiredService(variables: Variable[], dashboardId?: string) {
      const created = createService(variables, dashboardId);
      created.service.setInterpolationService(
        new VariableInterpolationService(() => created.service.getVariablesWithState())
      );
      return created;
    }

    /** Records each executed query. Each query returns one option derived from its text. */
    function recordQueries(): string[] {
      const queries: string[] = [];
      mockExecuteVariableQuery.mockImplementation((_dp: any, params: any) => {
        queries.push(params.query);
        return Promise.resolve(makeQueryResult([`v(${params.query})`]));
      });
      return queries;
    }

    /** A multi-select query variable set to "All", so its value follows its options. */
    function makeAllQueryVariable(overrides: Partial<QueryVariable>): QueryVariable {
      return makeQueryVariable({
        multi: true,
        includeAll: true,
        current: ['$__all'],
        ...overrides,
      });
    }

    /** Starts the scheduler, waits for the initial load, and forgets its queries. */
    async function loaded(service: VariableService, queries: string[]) {
      const controls = startScheduler(service);
      await service.whenSettled();
      queries.length = 0;
      return controls;
    }

    it('should not query before the time range is known', async () => {
      const queries = recordQueries();
      const { service } = createWiredService([makeQueryVariable({ id: 'a', query: 'qa' })]);
      const time$ = new Subject<TimeRange | undefined>();

      service.startRefreshScheduler({ time$, reload$: new Subject() });
      await Promise.resolve();
      await Promise.resolve();
      expect(queries).toEqual([]);

      time$.next(DEFAULT_TIME);
      await service.whenSettled();
      expect(queries).toEqual(['qa']);
    });

    it('should show a waiting dependent as loading, so no idle state mixes old and new values', async () => {
      // a's options change with the time range; b's options embed a's value.
      let round = 0;
      mockExecuteVariableQuery.mockImplementation((_dp: any, params: any) =>
        Promise.resolve(
          makeQueryResult([params.query === 'qa' ? `a${round}` : `v(${params.query})`])
        )
      );
      const a = makeAllQueryVariable({ id: 'a', name: 'a', query: 'qa', useTimeFilter: true });
      const b = makeAllQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const { service } = createWiredService([a, b]);
      const controls = startScheduler(service);
      await service.whenSettled();

      // Like a panel: act only when no variable is loading.
      const idle: string[][] = [];
      const sub = service.getVariables$().subscribe((vars: any[]) => {
        if (vars.some((v) => v.loading)) return;
        idle.push(vars.map((v) => getOptionValues(v.options).join(',')));
      });
      round = 1;
      controls.time$.next({ from: 'now-1h', to: 'now' });
      await service.whenSettled();
      sub.unsubscribe();

      expect(idle.length).toBeGreaterThan(0);
      // In every idle state, b's options were built from a's current options.
      idle.forEach(([aOptions, bOptions]) => expect(bOptions).toContain(aOptions));
      expect(idle[idle.length - 1][0]).toBe('a1');
    });

    it('marks dependents pending before publishing a changed upstream selection', async () => {
      recordQueries();
      const a = makeCustomVariable({
        id: 'a',
        name: 'a',
        customOptions: ['dev', 'prod'],
        current: ['dev'],
      });
      const b = makeAllQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const { service } = createWiredService([a, b]);
      await startLoaded(service);
      const ready: Array<{ value?: string; options: string[] }> = [];
      const subscription = service.getVariables$().subscribe((variables) => {
        if (variables.some((variable) => variable.loading)) return;
        ready.push({
          value: variables[0].current?.[0],
          options: getOptionValues(variables[1].options),
        });
      });

      try {
        service.updateVariableValue('a', ['prod']);
        await service.whenSettled();

        ready.forEach(({ value, options }) => expect(options).toEqual([`v(qb ${value})`]));
        expect(ready[ready.length - 1]).toEqual({ value: 'prod', options: ['v(qb prod)'] });
      } finally {
        subscription.unsubscribe();
        service.destroy();
      }
    });

    it('should clear the waiting flag when the upstream result does not change', async () => {
      const queries = recordQueries();
      const a = makeAllQueryVariable({ id: 'a', name: 'a', query: 'qa', useTimeFilter: true });
      const b = makeAllQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const { service } = createWiredService([a, b]);
      const controls = await loaded(service, queries);
      let releaseA: () => void = () => {};
      mockExecuteVariableQuery.mockImplementation((_dp: any, params: any) => {
        queries.push(params.query);
        const result = makeQueryResult([`v(${params.query})`]);
        return new Promise((resolve) => (releaseA = () => resolve(result)));
      });

      controls.time$.next({ from: 'now-1h', to: 'now' });
      await flushTasks();
      // b waits for a while a re-queries.
      expect(service.getVariablesWithState().find((v) => v.id === 'b')?.loading).toBe(true);

      releaseA();
      await service.whenSettled();
      // a's options did not change, so b's query is the same and b is not re-queried.
      expect(queries).toEqual(['qa']);
      expect(service.getVariablesWithState().find((v) => v.id === 'b')?.loading).toBe(false);
    });

    it('should clear the waiting flag when the scheduler stops', async () => {
      const queries = recordQueries();
      const a = makeAllQueryVariable({ id: 'a', name: 'a', query: 'qa', useTimeFilter: true });
      const b = makeAllQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const { service } = createWiredService([a, b]);
      const controls = await loaded(service, queries);
      mockExecuteVariableQuery.mockImplementation(() => new Promise(() => {}));

      controls.time$.next({ from: 'now-1h', to: 'now' });
      await flushTasks();
      expect(service.getVariablesWithState().find((v) => v.id === 'b')?.loading).toBe(true);

      controls.stop();
      expect(service.getVariablesWithState().find((v) => v.id === 'b')?.loading).toBe(false);
    });

    it('should load every variable again when the scheduler is restarted', async () => {
      const queries = recordQueries();
      const a = makeQueryVariable({ id: 'a', name: 'a', query: 'qa' });
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const { service } = createWiredService([a, b]);
      const controls = await loaded(service, queries);

      controls.stop();
      startScheduler(service);
      await service.whenSettled();

      // Same inputs as before the stop, but a restart is a fresh load.
      expect(queries).toEqual(['qa', 'qb api']);
    });

    it('should settle when a waiting variable is removed', async () => {
      const queries = recordQueries();
      const a = makeAllQueryVariable({ id: 'a', name: 'a', query: 'qa', useTimeFilter: true });
      const b = makeAllQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const { service } = createWiredService([a, b], 'dashboard-123');
      const controls = await loaded(service, queries);
      let releaseA: () => void = () => {};
      mockExecuteVariableQuery.mockImplementation((_dp: any, params: any) => {
        queries.push(params.query);
        const result = makeQueryResult([`v(${params.query})`]);
        return new Promise((resolve) => (releaseA = () => resolve(result)));
      });

      controls.time$.next({ from: 'now-1h', to: 'now' });
      await flushTasks();
      expect(service.getVariablesWithState().find((v) => v.id === 'b')?.loading).toBe(true);

      await service.removeVariable('b');
      releaseA();
      await service.whenSettled();

      expect(service.getVariablesWithState().map((v) => v.id)).toEqual(['a']);
      expect(service.getVariablesWithState()[0].loading).toBe(false);
      expect(queries).toEqual(['qa']);
    });

    it('should clear loading when a waiting variable becomes a custom variable', async () => {
      const queries = recordQueries();
      const a = makeAllQueryVariable({ id: 'a', name: 'a', query: 'qa', useTimeFilter: true });
      const b = makeAllQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const { service } = createWiredService([a, b], 'dashboard-123');
      const controls = await loaded(service, queries);
      let releaseA: () => void = () => {};
      mockExecuteVariableQuery.mockImplementation((_dp: any, params: any) => {
        queries.push(params.query);
        const result = makeQueryResult([`v(${params.query})`]);
        return new Promise((resolve) => (releaseA = () => resolve(result)));
      });

      controls.time$.next({ from: 'now-1h', to: 'now' });
      await flushTasks();
      expect(service.getVariablesWithState().find((v) => v.id === 'b')?.loading).toBe(true);

      await service.updateVariable('b', {
        type: VariableType.Custom,
        customOptions: ['x', 'y'],
      } as Partial<Variable>);
      await flushTasks();
      // b no longer waits for a: a custom variable has nothing to fetch.
      expect(service.getVariablesWithState().find((v) => v.id === 'b')?.loading).toBe(false);

      releaseA();
      await service.whenSettled();
      expect(queries).toEqual(['qa']);
      expect(service.getVariablesWithState().every((v) => !v.loading)).toBe(true);
    });

    it('starts independent upstreams in parallel and waits for both before querying their dependent', async () => {
      const pending = deferQueries();
      const a = makeQueryVariable({ id: 'a', name: 'a', query: 'qa', current: undefined });
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb', current: undefined });
      const c = makeQueryVariable({ id: 'c', name: 'c', query: 'qc $a $b' });
      const { service } = createWiredService([a, b, c]);

      startScheduler(service);
      await flushTasks();
      expect(pending).toHaveLength(2);
      expect(pending.map((request) => request.query)).toEqual(expect.arrayContaining(['qa', 'qb']));

      pending.find((request) => request.query === 'qb')!.resolve(['b']);
      await flushTasks();
      expect(pending).toHaveLength(2);
      expect(service.getVariablesWithState().find((variable) => variable.id === 'c')!.loading).toBe(
        true
      );

      pending.find((request) => request.query === 'qa')!.resolve(['a']);
      await flushTasks();
      expect(pending).toHaveLength(3);
      expect(pending[2].query).toBe('qc a b');
      pending[2].resolve(['c']);
      await service.whenSettled();
      expect(service.getVariablesWithState().every((variable) => !variable.loading)).toBe(true);
    });

    it('should hold a dependent while a transitive upstream is loading', async () => {
      // z -> a -> b. On reload every key changes; b must not query with a's old
      // value while z is still loading and a is waiting for it.
      let round = 0;
      const queries: string[] = [];
      mockExecuteVariableQuery.mockImplementation((_dp: any, params: any) => {
        queries.push(params.query);
        return Promise.resolve(makeQueryResult([`${params.query.split(' ')[0]}-${round}`]));
      });
      const z = makeAllQueryVariable({ id: 'z', name: 'z', query: 'qz' });
      const a = makeAllQueryVariable({ id: 'a', name: 'a', query: 'qa $z' });
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const { service } = createWiredService([z, a, b]);
      const { reload$ } = await loaded(service, queries);

      round = 1;
      reload$.next();
      await service.whenSettled();

      expect(queries).toEqual(['qz', "qa ('qz-1')", "qb ('qa-1')"]);
    });

    it('should re-query only time-filtered variables when their result leaves dependents unchanged', async () => {
      const queries = recordQueries();
      const region = makeQueryVariable({
        id: 'region-1',
        name: 'region',
        query: 'region-query',
        useTimeFilter: true,
        current: ['CN'],
      });
      const svc = makeQueryVariable({ id: 'service-1', name: 'service', query: 'svc $region' });
      const other = makeQueryVariable({
        id: 'other-1',
        name: 'other',
        query: 'other-query',
        useTimeFilter: false,
      });
      const { service } = createWiredService([region, svc, other]);
      await loaded(service, queries);

      await changeTime(service, { from: 'now-1h', to: 'now' });

      // region still has the value CN, so service's query is unchanged.
      expect(queries).toEqual(['region-query']);
    });

    it('should query dependents with the refreshed "All" expansion', async () => {
      let regionValues = ['CN', 'JP'];
      const queries: string[] = [];
      mockExecuteVariableQuery.mockImplementation((_dp: any, params: any) => {
        queries.push(params.query);
        return Promise.resolve(
          params.query === 'region-query'
            ? makeQueryResult(regionValues, 'region')
            : makeQueryResult(['svc'])
        );
      });
      const region = makeAllQueryVariable({
        id: 'region-1',
        name: 'region',
        query: 'region-query',
        useTimeFilter: true,
      });
      const svc = makeQueryVariable({
        id: 'service-1',
        name: 'service',
        query: 'source=logs | where region in $region',
      });
      const { service } = createWiredService([region, svc]);
      await loaded(service, queries);

      regionValues = ['CN', 'IN'];
      await changeTime(service, { from: 'now-1h', to: 'now' });

      expect(queries).toEqual(['region-query', "source=logs | where region in ('CN', 'IN')"]);
      expect(
        service.getVariables().find((variable) => variable.id === 'region-1')!.current
      ).toEqual(['$__all']);
    });

    it('reloads every query variable, including independent and dependent variables', async () => {
      const queries = recordQueries();
      const a = makeQueryVariable({ id: 'a', name: 'a', query: 'qa' });
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const unrelated = makeQueryVariable({ id: 'other', name: 'other', query: 'qother' });
      const { service } = createWiredService([a, b, unrelated]);
      await loaded(service, queries);

      await refresh(service);

      expect(queries).toHaveLength(3);
      expect(queries).toEqual(expect.arrayContaining(['qa', 'qb api', 'qother']));
    });

    it('should re-query dependents of a changed value, but not the changed variable', async () => {
      const queries = recordQueries();
      const a = makeQueryVariable({ id: 'a', name: 'a', query: 'qa' });
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const unrelated = makeQueryVariable({ id: 'other', name: 'other', query: 'qother' });
      const { service } = createWiredService([a, b, unrelated]);
      await loaded(service, queries);

      service.updateVariableValue('a', ['x']);
      await service.whenSettled();

      expect(queries).toEqual(['qb x']);
      expect(service.getVariables().find((variable) => variable.id === 'a')!.current).toEqual([
        'x',
      ]);
    });

    it('should not re-query when a value is set to the value it already has', async () => {
      const queries = recordQueries();
      const env = makeCustomVariable({ id: 'env', name: 'env', current: ['dev'] });
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb $env' });
      const { service } = createWiredService([env, b]);
      await loaded(service, queries);

      service.updateVariableValue('env', ['dev']);
      await service.whenSettled();

      expect(queries).toEqual([]);
    });

    it.each(['reload', 'changed input'])(
      'keeps a failed attempt until %s requests a new attempt',
      async (trigger) => {
        mockExecuteVariableQuery
          .mockRejectedValueOnce(new Error('query failed'))
          .mockResolvedValueOnce(makeQueryResult(['recovered']));
        const a = makeCustomVariable({
          id: 'a',
          name: 'a',
          customOptions: ['dev', 'prod'],
          current: ['dev'],
        });
        const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
        const { service } = createWiredService([a, b]);
        const { reload$ } = startScheduler(service);
        await service.whenSettled();

        // These changes coalesce to the same query; no new attempt has started.
        service.updateVariableValue('a', ['prod']);
        service.updateVariableValue('a', ['dev']);
        await service.whenSettled();

        expect(mockExecuteVariableQuery).toHaveBeenCalledTimes(1);
        expect(service.getVariablesWithState()[1]).toMatchObject({
          loading: false,
          error: 'query failed',
        });

        if (trigger === 'reload') {
          reload$.next();
        } else {
          service.updateVariableValue('a', ['prod']);
        }
        await service.whenSettled();
        expect(mockExecuteVariableQuery.mock.calls.map(([, config]) => config.query)).toEqual([
          'qb dev',
          trigger === 'reload' ? 'qb dev' : 'qb prod',
        ]);
        expect(service.getVariablesWithState()[1]).toMatchObject({
          loading: false,
          error: undefined,
          options: [{ value: 'recovered' }],
        });
      }
    );

    it('does not wait on a variable whose name is only a prefix of the referenced name', async () => {
      const pending = deferQueries();
      const env = makeQueryVariable({ id: 'env', name: 'env', query: 'qenv' });
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb $environment' });
      const { service } = createWiredService([env, b]);

      startScheduler(service);
      await flushTasks();
      expect(pending).toHaveLength(2);
      expect(pending.map((request) => request.query)).toEqual(
        expect.arrayContaining(['qenv', 'qb $environment'])
      );
      pending.forEach((request) => request.resolve(['result']));
      await service.whenSettled();
      service.updateVariableValue('env', ['prod']);
      await service.whenSettled();

      expect(pending).toHaveLength(2);
    });

    it('should not re-query a variable when a variable listed after it changes', async () => {
      // b is listed first, so its query never interpolates a and cannot change.
      const queries = recordQueries();
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb ${a}' });
      const a = makeCustomVariable({ id: 'a', name: 'a' });
      const { service } = createWiredService([b, a]);
      await loaded(service, queries);

      service.updateVariableValue('a', ['prod']);
      await service.whenSettled();

      expect(queries).toEqual([]);
    });

    it('should start independent dependents concurrently', async () => {
      const queries = recordQueries();
      const env = makeCustomVariable({ id: 'env', name: 'env' });
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb $env' });
      const c = makeQueryVariable({ id: 'c', name: 'c', query: 'qc $env' });
      const { service } = createWiredService([env, b, c]);
      await loaded(service, queries);
      const pending = deferQueries();

      service.updateVariableValue('env', ['prod']);
      await flushTasks();
      expect(pending).toHaveLength(2);
      expect(pending.map((request) => request.query)).toEqual(
        expect.arrayContaining(['qb prod', 'qc prod'])
      );
      pending.forEach((request) => request.resolve(['result']));
      await service.whenSettled();
    });

    it('should wait for an upstream to finish before starting its dependent', async () => {
      const queries = recordQueries();
      const env = makeCustomVariable({ id: 'env', name: 'env' });
      const b = makeAllQueryVariable({ id: 'b', name: 'b', query: 'qb $env' });
      const c = makeQueryVariable({ id: 'c', name: 'c', query: 'qc $b' });
      const { service } = createWiredService([env, b, c]);
      await loaded(service, queries);
      const pending = deferQueries();

      service.updateVariableValue('env', ['prod']);
      await flushTasks();
      expect(pending.map((request) => request.query)).toEqual(['qb prod']);
      pending[0].resolve(['v-prod']);
      await flushTasks();
      expect(pending.map((request) => request.query)).toEqual(['qb prod', "qc ('v-prod')"]);
      pending[1].resolve(['result']);
      await service.whenSettled();
    });

    it('should keep only the newest result when a query changes while it is running', async () => {
      const pending = deferQueries();
      const env = makeCustomVariable({ id: 'env', name: 'env' });
      const svc = makeQueryVariable({ id: 'svc', name: 'svc', query: 'qsvc $env', current: [] });
      const { service } = createWiredService([env, svc]);
      startScheduler(service);
      await flushTasks();

      service.updateVariableValue('env', ['prod']);
      await flushTasks();
      expect(pending.map((request) => request.query)).toEqual(['qsvc dev', 'qsvc prod']);
      expect(pending[0].signal?.aborted).toBe(true);

      pending[1].resolve(['new']);
      await service.whenSettled();
      // The transport can still deliver a response after cancellation.
      pending[0].resolve(['old']);
      await flushTasks();
      expect(getOptionValues(service.getVariablesWithState()[1].options)).toEqual(['new']);
      expect(service.getVariables()[1].current).toEqual(['new']);
    });

    it('should re-query dependents with the new "All" expansion when custom options are edited', async () => {
      const queries = recordQueries();
      const env = makeCustomVariable({
        id: 'env',
        name: 'env',
        multi: true,
        includeAll: true,
        current: ['$__all'],
        customOptions: [{ value: 'dev' }, { value: 'prod' }],
      });
      const svc = makeQueryVariable({ id: 'svc', name: 'svc', query: 'where env in $env' });
      const { service } = createWiredService([env, svc], 'dashboard-123');
      await loaded(service, queries);

      await service.updateVariable('env', {
        customOptions: [{ value: 'dev' }, { value: 'prod' }, { value: 'qa' }],
      } as any);
      await service.whenSettled();

      expect(queries).toEqual(["where env in ('dev', 'prod', 'qa')"]);
    });

    it('should re-query dependents when multi is turned off on a custom variable', async () => {
      const queries = recordQueries();
      const env = makeCustomVariable({
        id: 'env',
        name: 'env',
        multi: true,
        current: ['dev', 'prod'],
      });
      const svc = makeQueryVariable({ id: 'svc', name: 'svc', query: 'qsvc $env' });
      const { service } = createWiredService([env, svc], 'dashboard-123');
      await loaded(service, queries);

      await service.updateVariable('env', { multi: false } as any);
      await service.whenSettled();

      expect(service.getVariables()[0].current).toEqual(['dev']);
      expect(service.getVariables()[0].multi).toBe(false);
      expect(queries).toEqual(['qsvc dev']);
    });

    it('should re-query dependents of a Text variable when its value is edited', async () => {
      const queries = recordQueries();
      const keyword = makeTextVariable({ id: 'kw', name: 'kw', current: ['a'] });
      const svc = makeQueryVariable({ id: 'svc', name: 'svc', query: 'qsvc $kw' });
      const { service } = createWiredService([keyword, svc], 'dashboard-123');
      await loaded(service, queries);

      await service.updateVariable('kw', { current: ['b'] } as any);
      await service.whenSettled();

      expect(queries).toEqual(['qsvc b']);
    });

    it('should re-query variables referencing the old or new name when a variable is renamed', async () => {
      const queries = recordQueries();
      const env = makeCustomVariable({ id: 'env', name: 'env' });
      const oldRef = makeQueryVariable({ id: 'old', name: 'old', query: 'qold $env' });
      const newRef = makeQueryVariable({ id: 'new', name: 'new', query: 'qnew $stage' });
      const other = makeQueryVariable({ id: 'other', name: 'other', query: 'qother' });
      const { service } = createWiredService([env, oldRef, newRef, other], 'dashboard-123');
      await loaded(service, queries);

      await service.updateVariable('env', { name: 'stage' } as any);
      await service.whenSettled();

      // $env no longer resolves; $stage now does.
      expect(queries).toEqual(['qold $env', 'qnew dev']);
    });

    it('should re-query dependents of a renamed query variable', async () => {
      const queries = recordQueries();
      const a = makeQueryVariable({ id: 'a', name: 'a', query: 'qa' });
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const { service } = createWiredService([a, b], 'dashboard-123');
      await loaded(service, queries);

      await service.updateVariable('a', { name: 'renamed', query: 'qa' } as any);
      await service.whenSettled();

      expect(queries).toEqual(['qb $a']);
    });

    it('should re-query a variable and its dependents when its query is edited', async () => {
      const queries = recordQueries();
      const a = makeAllQueryVariable({ id: 'a', name: 'a', query: 'qa' });
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const { service } = createWiredService([a, b], 'dashboard-123');
      await loaded(service, queries);

      await service.updateVariable('a', { query: 'qa2' } as any);
      await service.whenSettled();

      expect(queries).toEqual(['qa2', "qb ('v(qa2)')"]);
    });

    it('should not query when only the label is edited', async () => {
      const queries = recordQueries();
      const a = makeQueryVariable({ id: 'a', name: 'a', query: 'qa' });
      const { service } = createWiredService([a], 'dashboard-123');
      await loaded(service, queries);

      await service.updateVariable('a', { ...a, label: 'A' } as any);
      await service.whenSettled();

      expect(queries).toEqual([]);
    });

    it('should re-query dependents when a referenced variable is removed', async () => {
      const queries = recordQueries();
      const env = makeCustomVariable({ id: 'env', name: 'env' });
      const svc = makeQueryVariable({ id: 'svc', name: 'svc', query: 'qsvc $env' });
      const { service } = createWiredService([env, svc], 'dashboard-123');
      await loaded(service, queries);

      await service.removeVariable('env');
      await service.whenSettled();

      expect(queries).toEqual(['qsvc $env']);
    });

    it('should re-query a variable whose references change when variables are reordered', async () => {
      const queries = recordQueries();
      const b = makeQueryVariable({ id: 'b', name: 'b', query: 'qb $a' });
      const a = makeCustomVariable({ id: 'a', name: 'a' });
      const { service } = createWiredService([b, a]);
      await loaded(service, queries);

      service.reorderVariables(1, 0);
      await service.whenSettled();

      expect(service.getVariables().map((variable) => variable.id)).toEqual(['a', 'b']);
      expect(queries).toEqual(['qb dev']);
    });

    it('should stop querying once the scheduler is stopped', async () => {
      const queries = recordQueries();
      const env = makeCustomVariable({ id: 'env', name: 'env' });
      const svc = makeQueryVariable({ id: 'svc', name: 'svc', query: 'qsvc $env' });
      const { service } = createWiredService([env, svc]);
      const { stop } = await loaded(service, queries);

      stop();
      service.updateVariableValue('env', ['prod']);
      await flushTasks();

      expect(queries).toEqual([]);
    });

    it('should replace the previous scheduler when started again', async () => {
      const queries = recordQueries();
      const { service } = createWiredService([makeQueryVariable({ id: 'a', query: 'qa' })]);
      const reload$ = new Subject<void>();
      const firstStop = service.startRefreshScheduler({
        time$: new BehaviorSubject<TimeRange | undefined>(DEFAULT_TIME),
        reload$,
      });
      service.startRefreshScheduler({
        time$: new BehaviorSubject<TimeRange | undefined>(DEFAULT_TIME),
        reload$: new Subject(),
      });
      await service.whenSettled();
      expect(queries).toEqual(['qa']);

      // The first scheduler's inputs no longer do anything, and its stop
      // function does not stop the second one.
      firstStop();
      reload$.next();
      await service.whenSettled();
      expect(queries).toEqual(['qa']);
    });
  });

  describe('sort options', () => {
    it.each([
      { sort: VariableSortOrder.AlphabeticalAsc, expected: ['2', '100', '1', '10'] },
      { sort: VariableSortOrder.AlphabeticalDesc, expected: ['10', '1', '100', '2'] },
      { sort: VariableSortOrder.NumericalAsc, expected: ['1', '2', '10', '100'] },
      { sort: VariableSortOrder.NumericalDesc, expected: ['100', '10', '2', '1'] },
      { sort: VariableSortOrder.Disabled, expected: ['10', '2', '100', '1'] },
    ])(
      'derives $sort options using labels for alphabetical order and values for numeric order',
      ({ sort, expected }) => {
        const customOptions = [
          { value: '10', label: 'Ten' },
          { value: '2' },
          { value: '100', label: 'A hundred' },
          { value: '1', label: 'One' },
        ];
        const { service } = createService([
          makeCustomVariable({ customOptions: [...customOptions], sort }),
        ]);

        expect(getOptionValues(service.getVariablesWithState()[0].options)).toEqual(expected);
        expect((service.getVariables()[0] as CustomVariable).customOptions).toEqual(customOptions);
      }
    );

    it('uses the first sorted query option as the default selection', async () => {
      mockExecuteVariableQuery.mockResolvedValue(makeQueryResult(['zebra', 'apple', 'mango']));
      const { service } = createService([
        makeQueryVariable({ sort: VariableSortOrder.AlphabeticalAsc, current: undefined }),
      ]);

      await refresh(service);

      const withState = service.getVariablesWithState();
      expect(withState[0].options).toEqual([
        { value: 'apple' },
        { value: 'mango' },
        { value: 'zebra' },
      ]);
      expect(withState[0].current).toEqual(['apple']);
    });

    it('should sort query variable options alphabetically by label', async () => {
      mockExecuteVariableQuery.mockResolvedValue({
        rows: [
          { service_id: 'zebra', service_name: 'A label' },
          { service_id: 'apple', service_name: 'Z label' },
        ],
        fields: ['service_id', 'service_name'],
        fieldTypes: { service_id: 'string', service_name: 'string' },
      });
      const { service } = createService([
        makeQueryVariable({
          valueField: 'service_id',
          labelField: 'service_name',
          sort: VariableSortOrder.AlphabeticalAsc,
        }),
      ]);

      await refresh(service);

      const withState = service.getVariablesWithState();
      expect(withState[0].options).toEqual([
        { value: 'zebra', label: 'A label' },
        { value: 'apple', label: 'Z label' },
      ]);
    });

    it('should re-sort options when sort setting changes', async () => {
      const { service } = createService(
        [
          makeCustomVariable({
            customOptions: ['cherry', 'apple', 'banana'],
            sort: VariableSortOrder.Disabled,
          }),
        ],
        'dashboard-123'
      );

      await service.updateVariable('custom-1', { sort: VariableSortOrder.AlphabeticalAsc });

      const withState = service.getVariablesWithState();
      expect(getOptionValues(withState[0].options)).toEqual(['apple', 'banana', 'cherry']);
    });

    it('restores fetched order when query sorting is disabled without fetching again', async () => {
      mockExecuteVariableQuery.mockResolvedValueOnce(
        makeQueryResult(['cherry', 'apple', 'banana'])
      );
      const { service } = createService(
        [makeQueryVariable({ sort: VariableSortOrder.AlphabeticalAsc, current: ['apple'] })],
        'dashboard-123'
      );
      await startLoaded(service);
      expect(getOptionValues(service.getVariablesWithState()[0].options)).toEqual([
        'apple',
        'banana',
        'cherry',
      ]);

      await service.updateVariable('query-1', { sort: VariableSortOrder.Disabled });
      await service.whenSettled();

      expect(getOptionValues(service.getVariablesWithState()[0].options)).toEqual([
        'cherry',
        'apple',
        'banana',
      ]);
      expect(service.getVariables()[0].current).toEqual(['apple']);
      expect(mockExecuteVariableQuery).not.toHaveBeenCalled();
      service.destroy();
    });
  });

  it.each([false, true])('toggles hide=%s in memory without persisting it', (hide) => {
    const { service, mockSavedObjectsClient } = createService([makeCustomVariable({ hide })]);

    service.toggleVariableHide('custom-1');

    expect(service.getVariables()[0].hide).toBe(!hide);
    expect(mockSavedObjectsClient.update).not.toHaveBeenCalled();
  });

  describe('save failure rollback', () => {
    it('should rollback when addVariable save fails', async () => {
      const { service, mockSavedObjectsClient } = createService([], 'dashboard-123');
      mockSavedObjectsClient.update.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        service.addVariable({
          name: 'test',
          type: VariableType.Custom,
          customOptions: ['a', 'b'],
        } as any)
      ).rejects.toThrow('Network error');

      // Should not add the variable
      expect(service.getVariables()).toHaveLength(0);
    });

    it('should rollback when updateVariable save fails', async () => {
      const original = makeCustomVariable({ label: 'Original' });
      const { service, mockSavedObjectsClient } = createService([original], 'dashboard-123');
      const originalSnapshot = service.getVariablesWithState();
      mockSavedObjectsClient.update.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        service.updateVariable('custom-1', { label: 'Updated', customOptions: ['alpha', 'beta'] })
      ).rejects.toThrow('Network error');

      expect(service.getVariables()).toEqual([original]);
      expect(service.getVariablesWithState()).toEqual(originalSnapshot);
    });
  });

  describe('variables observable', () => {
    it('publishes added, edited and removed custom definitions with their derived options', async () => {
      const { service } = createService([], 'dashboard-123');
      let latest: VariableWithState[] = [];
      const subscription = service.getVariables$().subscribe((variables) => (latest = variables));

      await service.addVariable({
        name: 'env',
        type: VariableType.Custom,
        customOptions: ['dev', 'prod'],
      });
      expect(latest).toHaveLength(1);
      expect(latest[0].options).toEqual([{ value: 'dev' }, { value: 'prod' }]);
      const id = latest[0].id;

      await service.updateVariable(id, { customOptions: ['alpha', 'beta'] });
      expect(latest[0]).toMatchObject({
        current: ['alpha'],
        options: [{ value: 'alpha' }, { value: 'beta' }],
      });

      await service.removeVariable(id);
      expect(latest).toEqual([]);
      subscription.unsubscribe();
    });

    it('publishes definitions and selections without publishing execution-only changes', async () => {
      mockExecuteVariableQuery.mockResolvedValue(makeQueryResult(['api', 'web']));
      const variable = makeQueryVariable({ current: ['api'] });
      const { service } = createService([variable]);
      const definitions: Variable[][] = [];
      const subscription = service
        .getVariablesWithoutState$()
        .subscribe((variables) => definitions.push(variables));

      await refresh(service);
      expect(service.getVariablesWithState()[0].options).toEqual([
        { value: 'api' },
        { value: 'web' },
      ]);
      service.getVariablesWithState();
      expect(definitions).toEqual([[variable]]);

      service.updateVariableValue('query-1', ['web']);
      await service.whenSettled();
      expect(definitions).toEqual([[variable], [{ ...variable, current: ['web'] }]]);
      expect(service.getVariables()).toEqual(definitions[1]);
      subscription.unsubscribe();
    });
  });

  it.each([VariableType.Custom, VariableType.Query])(
    'keeps and sorts the complete %s option list beyond 100 entries',
    async (type) => {
      const values = Array.from(
        { length: 150 },
        (_, i) => `option-${String(149 - i).padStart(3, '0')}`
      );
      const variable =
        type === VariableType.Custom
          ? makeCustomVariable({
              customOptions: [...values],
              sort: VariableSortOrder.AlphabeticalAsc,
              current: ['option-100'],
            })
          : makeQueryVariable({
              sort: VariableSortOrder.AlphabeticalAsc,
              current: undefined,
            });
      mockExecuteVariableQuery.mockResolvedValue(makeQueryResult(values));
      const { service } = createService([variable]);
      await refresh(service);

      const expected = Array.from(
        { length: 150 },
        (_, i) => `option-${String(i).padStart(3, '0')}`
      );
      expect(getOptionValues(service.getVariablesWithState()[0].options)).toEqual(expected);
      expect(service.getVariables()[0].current).toEqual([
        type === VariableType.Custom ? 'option-100' : 'option-000',
      ]);
    }
  );

  describe('initializeFromDashboard', () => {
    it('should load variables from dashboard saved object', async () => {
      const mockVariables = [
        makeCustomVariable({ id: 'var-1', name: 'region' }),
        makeCustomVariable({ id: 'var-2', name: 'env' }),
      ];

      const mockSavedObjectsClient = {
        update: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockResolvedValue({
          attributes: {
            variablesJSON: JSON.stringify({ variables: mockVariables }),
          },
        }),
      };

      const service = new VariableService(
        {} as any,
        'dashboard-123',
        mockSavedObjectsClient as any
      );
      services.add(service);

      await service.initializeFromDashboard();

      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('dashboard', 'dashboard-123');
      expect(service.getVariables()).toEqual(mockVariables);
    });

    it('should handle empty variablesJSON', async () => {
      const mockSavedObjectsClient = {
        update: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockResolvedValue({
          attributes: {},
        }),
      };

      const service = new VariableService(
        {} as any,
        'dashboard-123',
        mockSavedObjectsClient as any
      );
      services.add(service);

      await service.initializeFromDashboard();

      expect(service.getVariables()).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockSavedObjectsClient = {
        update: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockRejectedValue(new Error('Dashboard not found')),
      };

      const service = new VariableService(
        {} as any,
        'dashboard-123',
        mockSavedObjectsClient as any
      );
      services.add(service);

      await service.initializeFromDashboard();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[VariableService] Failed to load variables from dashboard:',
        expect.any(Error)
      );
      expect(service.getVariables()).toEqual([]);

      consoleSpy.mockRestore();
    });
  });

  describe('"All" marker ($__all)', () => {
    it('clears the marker when includeAll is turned off', async () => {
      const { service } = createService(
        [makeCustomVariable({ multi: true, includeAll: true, current: ['$__all'] })],
        'dashboard-123'
      );

      await service.updateVariable('custom-1', { includeAll: false } as any);

      expect(getCurrentValues(service).env).toEqual([]);
    });

    it('clears the marker when switching from multi to single', async () => {
      const { service } = createService(
        [makeCustomVariable({ multi: true, includeAll: true, current: ['$__all'] })],
        'dashboard-123'
      );

      await service.updateVariable('custom-1', { multi: false } as any);

      expect(getCurrentValues(service).env).toEqual([]);
    });
  });

  describe('telemetry', () => {
    it('should not report anything when no telemetry sink is provided', async () => {
      // Sink is optional -- consumers like the explore plugin construct the
      // service without one and must not break.
      const service = new VariableService({} as any, 'dash-1', {
        update: jest.fn().mockResolvedValue({}),
      } as any);
      services.add(service);
      service.initialize([makeCustomVariable()]);

      await expect(
        service.addVariable({
          name: 'new_var',
          type: VariableType.Custom,
          customOptions: ['a'],
        } as any)
      ).resolves.toBeUndefined();
    });

    describe('variables_loaded', () => {
      it('should report count and distinct types on initialize', () => {
        const { telemetrySink } = createService([
          makeCustomVariable({ id: 'c1', name: 'env' }),
          makeCustomVariable({ id: 'c2', name: 'region' }),
          makeQueryVariable({ id: 'q1', name: 'service' }),
        ]);

        expect(telemetrySink).toHaveBeenCalledWith({
          name: 'variables_loaded',
          data: { count: 3, types: [VariableType.Custom, VariableType.Query] },
        });
      });

      it('should not report when the dashboard has no variables', () => {
        const { telemetrySink } = createService([]);

        expect(telemetrySink).not.toHaveBeenCalledWith(
          expect.objectContaining({ name: 'variables_loaded' })
        );
      });
    });

    describe('create', () => {
      it('should report variable_create_succeeded with the type', async () => {
        const { service, telemetrySink } = createService([], 'dash-1');

        await service.addVariable({
          name: 'env',
          type: VariableType.Custom,
          customOptions: ['dev'],
        } as any);

        expect(telemetrySink).toHaveBeenCalledWith({
          name: 'variable_create_succeeded',
          data: { type: VariableType.Custom },
        });
      });

      it('should report variable_create_failed and rethrow when persistence fails', async () => {
        const { service, mockSavedObjectsClient, telemetrySink } = createService([], 'dash-1');
        mockSavedObjectsClient.update.mockRejectedValue(new TypeError('boom'));

        await expect(
          service.addVariable({
            name: 'env',
            type: VariableType.Custom,
            customOptions: ['dev'],
          } as any)
        ).rejects.toThrow('boom');

        expect(telemetrySink).toHaveBeenCalledWith({
          name: 'variable_create_failed',
          data: { type: VariableType.Custom, errorType: 'TypeError' },
        });
        expect(telemetrySink).not.toHaveBeenCalledWith(
          expect.objectContaining({ name: 'variable_create_succeeded' })
        );
      });
    });

    describe('update', () => {
      it('should report variable_update_succeeded with the resolved type', async () => {
        const { service, telemetrySink } = createService([makeCustomVariable()], 'dash-1');

        // A partial update carrying no `type` must still report the real type.
        await service.updateVariable('custom-1', { name: 'renamed' });

        expect(telemetrySink).toHaveBeenCalledWith({
          name: 'variable_update_succeeded',
          data: { type: VariableType.Custom },
        });
      });

      it('should report variable_update_failed and rethrow when persistence fails', async () => {
        const { service, mockSavedObjectsClient, telemetrySink } = createService(
          [makeCustomVariable()],
          'dash-1'
        );
        mockSavedObjectsClient.update.mockRejectedValue(new Error('nope'));

        await expect(service.updateVariable('custom-1', { name: 'renamed' })).rejects.toThrow(
          'nope'
        );

        expect(telemetrySink).toHaveBeenCalledWith({
          name: 'variable_update_failed',
          data: { type: VariableType.Custom, errorType: 'Error' },
        });
      });
    });

    describe('delete', () => {
      it('should report variable_deleted with the removed variable type', async () => {
        const { service, telemetrySink } = createService([makeCustomVariable()], 'dash-1');

        await service.removeVariable('custom-1');

        expect(telemetrySink).toHaveBeenCalledWith({
          name: 'variable_deleted',
          data: { type: VariableType.Custom },
        });
      });
    });

    describe('value change', () => {
      it('should report variable_value_changed', () => {
        const { service, telemetrySink } = createService([makeCustomVariable()], 'dash-1');

        service.updateVariableValue('custom-1', ['prod']);

        expect(telemetrySink).toHaveBeenCalledWith({
          name: 'variable_value_changed',
          data: { type: VariableType.Custom },
        });
      });
    });

    describe('variable_query_failed', () => {
      it('should report the failure with language and error type', async () => {
        const { service, telemetrySink } = createService([makeQueryVariable()], 'dash-1');
        mockExecuteVariableQuery.mockRejectedValueOnce(new TypeError('bad query'));

        await refresh(service);

        expect(service.getVariablesWithState()[0]).toMatchObject({
          loading: false,
          error: 'bad query',
        });
        expect(telemetrySink).toHaveBeenCalledWith({
          name: 'variable_query_failed',
          data: { type: VariableType.Query, language: 'PPL', errorType: 'TypeError' },
        });
      });

      it('should not report aborted refreshes', async () => {
        const { service, telemetrySink } = createService([makeQueryVariable()], 'dash-1');
        const abortError = new Error('aborted');
        abortError.name = 'AbortError';
        mockExecuteVariableQuery.mockRejectedValueOnce(abortError);

        await refresh(service);

        expect(service.getVariablesWithState()[0]).toMatchObject({
          loading: false,
          error: undefined,
        });
        expect(telemetrySink).not.toHaveBeenCalledWith(
          expect.objectContaining({ name: 'variable_query_failed' })
        );
      });
    });

    it('should not break the feature when the sink throws', async () => {
      const throwingSink = jest.fn(() => {
        throw new Error('sink exploded');
      });
      const service = new VariableService(
        {} as any,
        'dash-1',
        { update: jest.fn().mockResolvedValue({}) } as any,
        throwingSink
      );
      services.add(service);
      service.initialize([]);

      await expect(
        service.addVariable({
          name: 'env',
          type: VariableType.Custom,
          customOptions: ['dev'],
        } as any)
      ).resolves.toBeUndefined();
      expect(throwingSink).toHaveBeenCalled();
    });
  });

  describe('allowCustomValue — Custom reconcile', () => {
    it.each([false, true])(
      'falls back to the first option after editing options when allowCustomValue is %s',
      async (allowCustomValue) => {
        const { service } = createService(
          [makeCustomVariable({ id: 'v1', name: 'v1', current: ['off-list'], allowCustomValue })],
          'dashboard-1'
        );

        await service.updateVariable('v1', { customOptions: ['dev', 'prod'] });

        expect(getCurrentValues(service).v1).toEqual(['dev']);
      }
    );

    it('keeps only the listed values from a mixed multi-select selection', async () => {
      const { service } = createService(
        [
          makeCustomVariable({
            id: 'v1',
            name: 'v1',
            multi: true,
            current: ['dev', 'off-list'],
            allowCustomValue: true,
          }),
        ],
        'dashboard-1'
      );

      await service.updateVariable('v1', { customOptions: ['dev', 'prod'] } as Partial<Variable>);

      expect(getCurrentValues(service).v1).toEqual(['dev']);
    });

    // This is the guarantee that actually makes the feature work: a value committed
    // from the variable bar is never reconciled away.
    it('never prunes an off-list value committed via updateVariableValue', () => {
      const { service } = createService([
        makeCustomVariable({ id: 'v1', name: 'v1', allowCustomValue: true }),
      ]);

      service.updateVariableValue('v1', ['typed-off-list']);

      expect(getCurrentValues(service).v1).toEqual(['typed-off-list']);
    });

    it('keeps an off-list value across unrelated variable edits', async () => {
      const { service } = createService(
        [
          makeCustomVariable({
            id: 'v1',
            name: 'v1',
            current: ['off-list'],
            allowCustomValue: true,
          }),
        ],
        'dashboard-1'
      );

      // Editing the label leaves the option list and user selection untouched.
      await service.updateVariable('v1', { label: 'New Label' } as Partial<Variable>);

      expect(getCurrentValues(service).v1).toEqual(['off-list']);
    });

    it('persists allowCustomValue when adding a variable', async () => {
      const { service } = createService([], 'dashboard-1');
      await service.addVariable({
        name: 'env',
        type: VariableType.Custom,
        customOptions: ['dev'],
        allowCustomValue: true,
      } as DistributiveOmit<Variable, 'id'>);

      expect(service.getVariables()[0].allowCustomValue).toBe(true);
    });

    it('keeps allowCustomValue across a type switch', async () => {
      const { service } = createService(
        [makeCustomVariable({ id: 'v1', name: 'v1', allowCustomValue: true })],
        'dashboard-1'
      );

      await service.updateVariable('v1', {
        type: VariableType.Query,
        query: 'source=logs | fields env',
        language: 'PPL',
      } as Partial<Variable>);

      expect(service.getVariables()[0].allowCustomValue).toBe(true);
    });
  });

  describe('Text variables', () => {
    it('should use the initial value supplied to addVariable as current', async () => {
      const { service } = createService([], 'dashboard-1');
      await service.addVariable({
        name: 'keyword',
        type: VariableType.Text,
        current: ['hello'],
      } as Omit<TextVariable, 'id' | 'current'> & { current?: string[] });

      const values = getCurrentValues(service);
      expect(values.keyword).toEqual(['hello']);
    });

    it('should leave current undefined when no initial value is provided', async () => {
      const { service } = createService([], 'dashboard-1');
      await service.addVariable({
        name: 'keyword',
        type: VariableType.Text,
      } as Omit<TextVariable, 'id' | 'current'>);

      expect(service.getVariables()[0].current).toBeUndefined();
    });

    it('should update current value via updateVariableValue', () => {
      const { service } = createService([makeTextVariable({ current: ['saved'] })]);
      service.updateVariableValue('text-1', ['typed-value']);

      const values = getCurrentValues(service);
      expect(values.keyword).toEqual(['typed-value']);
    });

    it('fetches only Query variables and keeps Custom and Text variables ready', async () => {
      const { service } = createService([
        makeCustomVariable(),
        makeTextVariable({ current: ['typed'] }),
        makeQueryVariable({ id: 'query-1', name: 'service' }),
      ]);

      await refresh(service);
      expect(mockExecuteVariableQuery).toHaveBeenCalledTimes(1);
      const variables = service.getVariablesWithState();
      expect(variables[0]).toMatchObject({
        loading: false,
        options: [{ value: 'dev' }, { value: 'staging' }, { value: 'prod' }],
      });
      expect(variables[1]).toMatchObject({ current: ['typed'], loading: false, options: [] });
      expect(variables[1].error).toBeUndefined();
    });

    it('should apply the editor-supplied current when switching an existing variable to Text', async () => {
      const { service } = createService(
        [makeCustomVariable({ id: 'v1', name: 'v1' })],
        'dashboard-1'
      );
      await service.updateVariable('v1', {
        type: VariableType.Text,
        current: ['seeded'],
      } as Partial<Variable>);

      const values = getCurrentValues(service);
      expect(values.v1).toEqual(['seeded']);
    });

    it.each([
      { multi: false, current: ['dev'] },
      { multi: true, current: ['dev', 'prod'] },
    ])(
      'clears the $current selection when switching to Text without an explicit value',
      async ({ multi, current }) => {
        const { service } = createService(
          [makeCustomVariable({ id: 'v1', name: 'v1', multi, current })],
          'dashboard-1'
        );
        await service.updateVariable('v1', { type: VariableType.Text });

        expect(service.getVariables()[0].current).toBeUndefined();
      }
    );

    it('should truncate an explicitly supplied multi-value current when switching to Text', async () => {
      const { service } = createService(
        [makeCustomVariable({ id: 'v1', name: 'v1', multi: true })],
        'dashboard-1'
      );
      await service.updateVariable('v1', {
        type: VariableType.Text,
        current: ['a', 'b'],
      } as Partial<Variable>);

      expect(getCurrentValues(service).v1).toEqual(['a']);
    });

    it('should drop option-shaping fields when switching to Text', async () => {
      const { service } = createService(
        [
          makeCustomVariable({
            id: 'v1',
            name: 'v1',
            label: 'My label',
            description: 'My description',
            hide: true,
            multi: true,
            includeAll: true,
            allowCustomValue: true,
            sort: VariableSortOrder.AlphabeticalAsc,
          }),
        ],
        'dashboard-1'
      );
      await service.updateVariable('v1', { type: VariableType.Text } as Partial<Variable>);

      const updated = service.getVariables()[0];
      // Everything that only makes sense for an option list is gone...
      expect(updated).not.toHaveProperty('multi');
      expect(updated).not.toHaveProperty('includeAll');
      expect(updated).not.toHaveProperty('allowCustomValue');
      expect(updated).not.toHaveProperty('sort');
      expect(updated).not.toHaveProperty('customOptions');
      // ...while the type-agnostic fields survive.
      expect(updated.label).toBe('My label');
      expect(updated.description).toBe('My description');
      expect(updated.hide).toBe(true);
    });

    it('should apply a new current when the editor saves a new value', async () => {
      const { service } = createService(
        [makeTextVariable({ id: 'v1', name: 'v1', current: ['old'] })],
        'dashboard-1'
      );
      await service.updateVariable('v1', { current: ['new'] } as Partial<TextVariable>);

      const values = getCurrentValues(service);
      expect(values.v1).toEqual(['new']);
    });

    it('should leave current untouched when updateVariable does not change it', async () => {
      const { service } = createService(
        [makeTextVariable({ id: 'v1', name: 'v1', current: ['live-value'] })],
        'dashboard-1'
      );

      // e.g. only the label changed — current should be left exactly as-is.
      await service.updateVariable('v1', { label: 'New Label' } as Partial<TextVariable>);

      const values = getCurrentValues(service);
      expect(values.v1).toEqual(['live-value']);
    });
  });
});
