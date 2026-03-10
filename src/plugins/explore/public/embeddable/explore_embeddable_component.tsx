/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { SearchProps } from './explore_embeddable';
import { VisualizationNoResults } from '../../../visualizations/public';
import { getDocViewsRegistry } from '../application/legacy/discover/opensearch_dashboards_services';
import { DataTable } from '../components/data_table/data_table';
import { TableVis } from '../components/visualizations/table/table_vis';
import { TableChartStyle } from '../components/visualizations/table/table_vis_config';
import { getLegacyDisplayedColumns } from '../helpers/data_table_helper';
import { SAMPLE_SIZE_SETTING } from '../../common';
import { EchartsRender } from '../components/visualizations/echarts_render';

interface ExploreEmbeddableProps {
  searchProps: SearchProps;
}

export const ExploreEmbeddableComponent = ({ searchProps }: ExploreEmbeddableProps) => {
  const { services } = searchProps;

  const docViewsRegistry = useMemo(() => getDocViewsRegistry(), []);

  const displayedColumns = useMemo(() => {
    if (!searchProps.columns || !searchProps.indexPattern) {
      return [];
    }
    return getLegacyDisplayedColumns(
      searchProps.columns,
      searchProps.indexPattern,
      !searchProps.displayTimeColumn,
      false
    );
  }, [searchProps.columns, searchProps.indexPattern, searchProps.displayTimeColumn]);

  const sampleSize = services.uiSettings.get(SAMPLE_SIZE_SETTING);

  const handleFilter = useMemo(() => {
    if (!searchProps.onFilter || !searchProps.indexPattern) {
      return () => {};
    }

    return (mapping: any, value: unknown, mode: '+' | '-') => {
      let fieldName: string;
      if (typeof mapping === 'string') {
        fieldName = mapping;
      } else if (mapping && typeof mapping === 'object' && 'name' in mapping) {
        fieldName = mapping.name;
      } else {
        return;
      }

      const field = searchProps.indexPattern?.getFieldByName(fieldName);
      if (!field) return;

      const values = Array.isArray(value) ? value.map(String) : [String(value)];
      const operator = mode === '+' ? '+' : '-';
      searchProps.onFilter!(field, values, operator);
    };
  }, [searchProps]);

  const getEmbeddableContent = () => {
    if (searchProps?.rows?.length === 0) {
      return (
        <EuiFlexItem>
          <VisualizationNoResults />
        </EuiFlexItem>
      );
    }

    if (searchProps.activeTab === 'logs') {
      return (
        <DataTable
          columns={displayedColumns}
          rows={searchProps.rows || []}
          dataset={searchProps.indexPattern!}
          hits={searchProps.hits}
          sampleSize={sampleSize}
          isShortDots={false}
          showPagination={true}
          docViewsRegistry={docViewsRegistry}
          onRemoveColumn={searchProps.onRemoveColumn}
          onAddColumn={searchProps.onAddColumn}
          onFilter={handleFilter}
        />
      );
    }

    if (searchProps.chartType === 'table') {
      return (
        <TableVis
          columns={searchProps.tableData?.columns ?? []}
          rows={searchProps.tableData?.rows ?? []}
          styleOptions={searchProps.styleOptions as TableChartStyle}
          disableActions={true}
        />
      );
    }

    if (searchProps.spec) {
      return (
        <EchartsRender spec={searchProps.spec} onSelectTimeRange={searchProps.onSelectTimeRange} />
      );
    }

    return null;
  };

  return (
    <EuiFlexGroup
      gutterSize="xs"
      direction="column"
      responsive={false}
      data-test-subj="embeddedSavedExplore"
      style={{ overflowX: 'auto' }}
    >
      <EuiFlexItem style={{ minHeight: 0 }} data-test-subj="osdExploreContainer">
        {getEmbeddableContent()}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
