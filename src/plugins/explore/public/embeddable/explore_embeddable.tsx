/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEqual } from 'lodash';
import moment from 'moment';
import { merge, Subscription } from 'rxjs';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { i18n } from '@osd/i18n';
import { RequestAdapter, Adapters } from '../../../inspector/public';
import {
  opensearchFilters,
  Filter,
  TimeRange,
  FilterManager,
  getTime,
  Query,
  UI_SETTINGS,
  IFieldType,
} from '../../../data/public';
import {
  Container,
  Embeddable,
  IEmbeddable,
  ReferenceOrValueEmbeddable,
} from '../../../embeddable/public';
import {
  ExploreInput,
  ExploreOutput,
  ExploreByValueInput,
  ExploreByReferenceInput,
  ExploreByValueAttributes,
} from './types';
import {
  getRequestInspectorStats,
  getResponseInspectorStats,
  IndexPattern,
  ISearchSource,
} from '../application/legacy/discover/opensearch_dashboards_services';
import { EXPLORE_EMBEDDABLE_TYPE } from './constants';
import { SortOrder } from '../types/saved_explore_types';
import { SavedExplore } from '../saved_explore';
import { ExploreEmbeddableComponent } from './explore_embeddable_component';
import { ExploreServices } from '../types';
import { VisColumn } from '../components/visualizations/types';
import { DOC_HIDE_TIME_COLUMN_SETTING, SAMPLE_SIZE_SETTING } from '../../common';
import * as columnActions from '../application/legacy/discover/application/utils/state_management/common';
import { buildColumns } from '../application/legacy/discover/application/utils/columns';
import { APPLY_FILTER_TRIGGER } from '../../../ui_actions/public';
import { TriggerContextMapping } from '../../../ui_actions/public';
import {
  ChartType,
  StyleOptions,
} from '../components/visualizations/utils/use_visualization_types';
import { defaultPrepareQueryString } from '../application/utils/state_management/actions/query_actions';
import {
  adaptLegacyData,
  convertStringsToMappings,
} from '../components/visualizations/visualization_builder_utils';
import { normalizeResultRows } from '../components/visualizations/utils/normalize_result_rows';
import { visualizationRegistry } from '../components/visualizations/visualization_registry';
import { prepareQueryForLanguage } from '../application/utils/languages';
import { mergeStyles } from '../components/visualizations/utils/utils';
import { AttributeService, ATTRIBUTE_SERVICE_KEY } from '../../../dashboard/public';

export interface SearchProps {
  description?: string;
  sort?: SortOrder[];
  inspectorAdapters?: Adapters;
  rows?: any[];
  indexPattern?: IndexPattern;
  hits?: number;
  isLoading?: boolean;
  services: ExploreServices;
  spec?: any;
  sharedItemTitle?: string;
  chartType?: ChartType;
  activeTab?: string;
  styleOptions?: StyleOptions;
  displayTimeColumn: boolean;
  title: string;
  columns?: string[];
  onSort?: (sort: SortOrder[]) => void;
  onAddColumn?: (column: string) => void;
  onRemoveColumn?: (column: string) => void;
  onReorderColumn?: (col: string, source: number, destination: number) => void;
  onMoveColumn?: (column: string, index: number) => void;
  onSetColumns?: (columns: string[]) => void;
  onFilter?: (field: IFieldType, value: string[], operator: string) => void;
  onSelectTimeRange?: (range: TimeRange) => void;
  tableData?: {
    rows: Array<Record<string, any>>;
    columns: VisColumn[];
  };
}

interface ExploreEmbeddableConfig {
  savedExplore: SavedExplore;
  editUrl: string;
  editPath: string;
  indexPatterns?: IndexPattern[];
  editable: boolean;
  filterManager: FilterManager;
  services: ExploreServices;
  editApp: string;
}

export class ExploreEmbeddable
  extends Embeddable<ExploreInput, ExploreOutput>
  implements
    IEmbeddable<ExploreInput, ExploreOutput>,
    ReferenceOrValueEmbeddable<ExploreByValueInput, ExploreByReferenceInput> {
  private abortController?: AbortController;
  private readonly savedExplore: SavedExplore;
  private inspectorAdaptors: Adapters;
  private searchProps?: SearchProps;
  private filtersSearchSource?: ISearchSource;
  private subscription: Subscription;
  private autoRefreshFetchSubscription?: Subscription;
  public readonly type = EXPLORE_EMBEDDABLE_TYPE;
  private panelTitle: string = '';
  private filterManager: FilterManager;
  private services: ExploreServices;
  private prevState = {
    filters: undefined as Filter[] | undefined,
    query: undefined as Query | undefined,
    timeRange: undefined as TimeRange | undefined,
  };
  private node?: HTMLElement;
  private root?: Root;

  constructor(
    {
      savedExplore,
      editUrl,
      editPath,
      indexPatterns,
      editable,
      filterManager,
      services,
      editApp,
    }: ExploreEmbeddableConfig,
    initialInput: ExploreInput,
    private readonly attributeService?: AttributeService<
      ExploreByValueAttributes,
      ExploreByValueInput,
      ExploreByReferenceInput
    >,
    parent?: Container
  ) {
    super(
      initialInput,
      {
        defaultTitle: savedExplore.title,
        editUrl,
        editPath,
        editApp,
        indexPatterns,
        editable,
      },
      parent
    );
    this.services = services;
    this.filterManager = filterManager;
    this.savedExplore = savedExplore;
    this.inspectorAdaptors = {
      requests: new RequestAdapter(),
    };
    this.initializeSearchProps();

    this.subscription = merge(this.getOutput$(), this.getInput$()).subscribe(() => {
      this.panelTitle = this.output.title || '';
      if (this.searchProps && this.node) {
        this.updateHandler(this.searchProps);
      }
    });
    this.autoRefreshFetchSubscription = this.services.timefilter
      .getAutoRefreshFetch$()
      .subscribe(() => {
        if (this.searchProps && this.node) {
          this.updateHandler(this.searchProps, true);
        }
      });
  }

  public supportedTriggers(): Array<keyof TriggerContextMapping> {
    return [APPLY_FILTER_TRIGGER];
  }

  inputIsRefType = (input: ExploreInput): input is ExploreByReferenceInput => {
    return this.attributeService?.inputIsRefType(input as ExploreByReferenceInput) ?? false;
  };

  getInputAsValueType = async (): Promise<ExploreByValueInput> => {
    const searchSource = this.savedExplore.searchSource;
    const searchSourceJSON = JSON.stringify(searchSource.getSerializedFields());

    const attributes: ExploreByValueAttributes = {
      title: this.savedExplore.title,
      description: this.savedExplore.description,
      columns: this.savedExplore.columns,
      sort: this.savedExplore.sort,
      type: this.savedExplore.type,
      visualization: this.savedExplore.visualization,
      uiState: this.savedExplore.uiState,
      kibanaSavedObjectMeta: { searchSourceJSON },
    };
    return {
      id: this.getInput().id,
      timeRange: this.getInput().timeRange,
      [ATTRIBUTE_SERVICE_KEY]: attributes,
    } as ExploreByValueInput;
  };

  getInputAsRefType = async (): Promise<ExploreByReferenceInput> => {
    if (!this.attributeService) {
      throw new Error('AttributeService required for getInputAsRefType');
    }
    const input = this.attributeService.getExplicitInputFromEmbeddable(this);
    return this.attributeService.getInputAsRefType(input, {
      showSaveModal: true,
      saveModalTitle: this.getTitle(),
    }) as Promise<ExploreByReferenceInput>;
  };

  private updateSearchProps(changes: Partial<SearchProps>): SearchProps {
    this.searchProps = { ...this.searchProps!, ...changes };
    return this.searchProps;
  }

  private initializeSearchProps() {
    const { searchSource } = this.savedExplore;
    const indexPattern = searchSource.getField('index');
    const searchProps: SearchProps = {
      inspectorAdapters: this.inspectorAdaptors,
      rows: [],
      description: this.savedExplore.description,
      services: this.services,
      indexPattern,
      isLoading: false,
      displayTimeColumn: this.services.uiSettings.get(DOC_HIDE_TIME_COLUMN_SETTING, false),
      title: this.savedExplore.title,
    };
    const timeRangeSearchSource = searchSource.create();
    timeRangeSearchSource.setField('filter', () => {
      if (!this.searchProps || !this.input.timeRange) return;
      return getTime(indexPattern, this.input.timeRange);
    });
    this.filtersSearchSource = searchSource.create();
    this.filtersSearchSource.setParent(timeRangeSearchSource);
    searchSource.setParent(this.filtersSearchSource);
    const query = this.savedExplore.searchSource.getField('query');
    const uiState = JSON.parse(this.savedExplore.uiState || '{}');
    const activeTab = uiState.activeTab;
    if (query) {
      if (activeTab === 'logs') {
        query.query = defaultPrepareQueryString(query);
      } else {
        query.query = prepareQueryForLanguage(query).query;
      }
    }
    searchSource.setFields({
      index: indexPattern,
      query,
      highlightAll: true,
      version: true,
    });

    searchProps.onSort = (newSort) => {
      this.updateInput({ sort: newSort });
    };

    searchProps.onAddColumn = (columnName: string) => {
      if (!searchProps.columns) return;
      const updatedColumns = buildColumns(
        columnActions.addColumn(searchProps.columns, { column: columnName })
      );
      this.updateInput({ columns: updatedColumns });
    };

    searchProps.onRemoveColumn = (columnName: string) => {
      if (!searchProps.columns) return;
      const updatedColumns = columnActions.removeColumn(searchProps.columns, columnName);
      const updatedSort =
        searchProps.sort && searchProps.sort.length
          ? searchProps.sort.filter((s) => s[0] !== columnName)
          : [];
      this.updateInput({ sort: updatedSort, columns: updatedColumns });
    };

    searchProps.onMoveColumn = (columnName, newIndex: number) => {
      if (!searchProps.columns) return;
      const oldIndex = searchProps.columns.indexOf(columnName);
      const updatedColumns = columnActions.reorderColumn(searchProps.columns, oldIndex, newIndex);
      this.updateInput({ columns: updatedColumns });
    };

    searchProps.onSetColumns = (columnNames: string[]) => {
      const columns = buildColumns(columnNames);
      this.updateInput({ columns });
    };

    searchProps.onFilter = async (field, value, operator) => {
      let filters = opensearchFilters.generateFilters(
        this.filterManager,
        field,
        value,
        operator,
        indexPattern?.id!
      );
      filters = filters.map((filter) => ({
        ...filter,
        $state: { store: opensearchFilters.FilterStateStore.APP_STATE },
      }));
      this.services.uiActions.getTrigger(APPLY_FILTER_TRIGGER).exec({
        embeddable: this,
        filters,
      } as any);
    };

    searchProps.onSelectTimeRange = async (range: TimeRange) => {
      await this.services.uiActions.getTrigger(APPLY_FILTER_TRIGGER).exec({
        embeddable: this,
        timeFieldName: '*',
        filters: [
          {
            range: {
              '*': {
                mode: 'absolute',
                gte: moment(range.from),
                lte: moment(range.to),
              },
            },
          },
        ],
      } as any);
    };

    this.searchProps = searchProps;
  }

  private async updateHandler(searchProps: SearchProps, force = false) {
    const { filters, query, timeRange } = this.input;
    const needFetch =
      force ||
      !opensearchFilters.onlyDisabledFiltersChanged(filters, this.prevState.filters) ||
      !isEqual(query, this.prevState.query) ||
      !isEqual(timeRange, this.prevState.timeRange);

    this.updateSearchProps({
      columns: this.input.columns || this.savedExplore.columns,
      sort: this.input.sort || this.savedExplore.sort,
      sharedItemTitle: this.panelTitle,
    });

    if (needFetch) {
      this.prevState = { filters, query, timeRange };
      try {
        await this.fetch();
      } catch (error: any) {
        this.renderComplete.dispatchError();
        this.updateOutput({
          loading: false,
          error: {
            name: error?.body?.error,
            message: error?.body?.message,
          },
        });
      }
    }
    if (this.node && this.searchProps) {
      this.renderComponent(this.searchProps);
    }
  }

  public reload() {
    if (this.searchProps) {
      this.updateHandler(this.searchProps, true);
    }
  }

  private fetch = async () => {
    if (!this.searchProps) return;
    const { searchSource } = this.savedExplore;
    if (this.abortController) this.abortController.abort();
    this.abortController = new AbortController();
    searchSource.setField('size', this.services.uiSettings.get(SAMPLE_SIZE_SETTING));

    this.inspectorAdaptors.requests.reset();
    const title = i18n.translate('explore.embeddable.inspectorRequestDataTitle', {
      defaultMessage: 'Data',
    });
    const description = i18n.translate('explore.embeddable.inspectorRequestDescription', {
      defaultMessage: 'This request queries OpenSearch to fetch the data for the explore.',
    });
    const inspectorRequest = this.inspectorAdaptors.requests.start(title, { description });
    inspectorRequest.stats(getRequestInspectorStats(searchSource));
    searchSource.getSearchRequestBody().then((body: Record<string, unknown>) => {
      inspectorRequest.json(body);
    });

    this.renderComplete.dispatchInProgress();
    this.updateOutput({ loading: true, error: undefined });
    this.updateSearchProps({ isLoading: true });

    const query = searchSource.getField('query');
    const languageConfig = this.services.data.query.queryString
      .getLanguageService()
      .getLanguage(query!.language);
    const resp = await searchSource.fetch({
      abortSignal: this.abortController.signal,
      withLongNumeralsSupport: await this.services.uiSettings.get(
        UI_SETTINGS.DATA_WITH_LONG_NUMERALS
      ),
      ...(languageConfig &&
        languageConfig.fields?.formatter && {
          formatter: languageConfig.fields.formatter,
        }),
    });

    if (this.abortController.signal.aborted) return;

    const rows = resp.hits.hits;
    const fieldSchema = searchSource.getDataFrame()?.schema;
    const visualizationData = normalizeResultRows(rows, fieldSchema ?? []);
    const visualization = JSON.parse(this.savedExplore.visualization || '{}');
    const uiState = JSON.parse(this.savedExplore.uiState || '{}');
    const selectedChartType = visualization.chartType ?? 'line';
    const vis = visualizationRegistry.getVisualizationConfig(selectedChartType);

    const propsUpdate: Partial<SearchProps> = {
      chartType: selectedChartType,
      activeTab: uiState.activeTab,
      styleOptions: visualization.params,
    };

    if (uiState.activeTab !== 'logs' && visualizationData) {
      const { numericalColumns, categoricalColumns, dateColumns } = visualizationData;
      const allColumns = [
        ...(numericalColumns ?? []),
        ...(categoricalColumns ?? []),
        ...(dateColumns ?? []),
      ];

      if (visualizationData.transformedData && visualizationData.transformedData.length > 0) {
        if (selectedChartType === 'table') {
          propsUpdate.tableData = {
            columns: allColumns,
            rows: visualizationData.transformedData ?? [],
          };
        } else {
          const axesMapping = convertStringsToMappings(visualization.axesMapping, allColumns);
          const matchedRule = visualizationRegistry.findRuleByAxesMapping(
            visualization.axesMapping,
            allColumns
          );
          if (!matchedRule || !matchedRule.toSpec) {
            throw new Error(
              `Cannot load saved visualization "${this.panelTitle}" with id ${this.savedExplore.id}`
            );
          }
          const searchContext = {
            query: this.input.query,
            filters: this.input.filters,
            timeRange: this.input.timeRange,
          };
          const styleOptions = visualization.params;

          let styles = adaptLegacyData({
            type: selectedChartType,
            styles: styleOptions,
            axesMapping: visualization.axesMapping,
          })?.styles;

          if (vis) {
            styles = mergeStyles(vis.ui.style.defaults, styles);
          }
          propsUpdate.styleOptions = styles;

          const spec = matchedRule.toSpec(
            visualizationData.transformedData,
            numericalColumns,
            categoricalColumns,
            dateColumns,
            styles || styleOptions,
            selectedChartType,
            axesMapping,
            searchContext.timeRange
          );
          propsUpdate.spec = spec;
        }
      }
    }

    inspectorRequest.stats(getResponseInspectorStats(resp, searchSource)).ok({ json: resp });
    this.updateSearchProps({
      ...propsUpdate,
      rows,
      hits: resp.hits.hits.length,
      isLoading: false,
    });
    this.renderComplete.dispatchComplete();
    this.updateOutput({ loading: false, error: undefined });
  };

  private renderComponent(searchProps: SearchProps) {
    if (!this.searchProps || !this.root) return;
    this.root.render(<ExploreEmbeddableComponent searchProps={searchProps} />);
  }

  public render(node: HTMLElement) {
    super.render(node);
    this.node = node;
    this.node.style.height = '100%';
    this.node.setAttribute('data-shared-item', '');
    this.node.setAttribute('data-test-subj', 'exploreLoader');

    if (this.root) {
      this.root.unmount();
    }
    this.root = createRoot(node);

    if (this.searchProps) {
      this.updateSearchProps({ isLoading: true });
      this.renderComponent(this.searchProps);
      this.updateHandler(this.searchProps, true);
    }
  }

  public destroy() {
    super.destroy();
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.autoRefreshFetchSubscription) {
      this.autoRefreshFetchSubscription.unsubscribe();
    }
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.searchProps) {
      delete this.searchProps;
    }
    if (this.root) {
      this.root.unmount();
    }
  }

  public getInspectorAdapters() {
    return this.inspectorAdaptors;
  }
}
