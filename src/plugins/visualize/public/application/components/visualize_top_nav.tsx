/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { memo, useCallback, useMemo, useState, useEffect, useRef } from 'react';

import { AppMountParameters, OverlayRef } from 'opensearch-dashboards/public';
import { i18n } from '@osd/i18n';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFieldText,
  EuiButton,
  EuiIcon,
  EuiInputPopover,
  EuiListGroup,
  EuiListGroupItem,
} from '@elastic/eui';
import { useOpenSearchDashboards } from '../../../../opensearch_dashboards_react/public';
import {
  VisualizeServices,
  VisualizeAppState,
  VisualizeAppStateContainer,
  VisualizeEditorVisInstance,
} from '../types';
import { APP_NAME } from '../visualize_constants';
import { getTopNavConfig } from '../utils';
import type { IndexPattern } from '../../../../data/public';
import chatLogo from './query_assistant_logo.svg';
import { BehaviorSubject } from 'rxjs';

interface VisualizeTopNavProps {
  currentAppState: VisualizeAppState;
  isChromeVisible?: boolean;
  isEmbeddableRendered: boolean;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (value: boolean) => void;
  hasUnappliedChanges: boolean;
  originatingApp?: string;
  visInstance: VisualizeEditorVisInstance;
  setOriginatingApp?: (originatingApp: string | undefined) => void;
  stateContainer: VisualizeAppStateContainer;
  visualizationIdFromUrl?: string;
  embeddableId?: string;
  onAppLeave: AppMountParameters['onAppLeave'];
  onPPL?: (ppl: string) => void;
}

const input$ = new BehaviorSubject('');
// @ts-ignore
window['input$'] = input$;

const TopNav = ({
  currentAppState,
  isChromeVisible,
  isEmbeddableRendered,
  hasUnsavedChanges,
  setHasUnsavedChanges,
  hasUnappliedChanges,
  originatingApp,
  setOriginatingApp,
  visInstance,
  stateContainer,
  visualizationIdFromUrl,
  embeddableId,
  onAppLeave,
  onPPL,
}: VisualizeTopNavProps) => {
  const { services } = useOpenSearchDashboards<VisualizeServices>();
  const { TopNavMenu } = services.navigation.ui;
  const { setHeaderActionMenu, visualizeCapabilities } = services;
  const { embeddableHandler, vis } = visInstance;
  const [inspectorSession, setInspectorSession] = useState<OverlayRef>();
  const openInspector = useCallback(() => {
    const session = embeddableHandler.openInspector();
    setInspectorSession(session);
  }, [embeddableHandler]);
  const handleRefresh = useCallback(
    (_payload: any, isUpdate?: boolean) => {
      if (isUpdate === false) {
        visInstance.embeddableHandler.reload();
      }
    },
    [visInstance.embeddableHandler]
  );
  const stateTransfer = services.embeddable.getStateTransfer();

  const config = useMemo(() => {
    if (isEmbeddableRendered) {
      return getTopNavConfig(
        {
          hasUnsavedChanges,
          setHasUnsavedChanges,
          hasUnappliedChanges,
          openInspector,
          originatingApp,
          setOriginatingApp,
          visInstance,
          stateContainer,
          visualizationIdFromUrl,
          stateTransfer,
          embeddableId,
          onAppLeave,
        },
        services
      );
    }
  }, [
    isEmbeddableRendered,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    hasUnappliedChanges,
    openInspector,
    originatingApp,
    visInstance,
    setOriginatingApp,
    stateContainer,
    visualizationIdFromUrl,
    services,
    embeddableId,
    stateTransfer,
    onAppLeave,
  ]);
  const [indexPatterns, setIndexPatterns] = useState<IndexPattern[]>(
    vis.data.indexPattern ? [vis.data.indexPattern] : []
  );
  const showDatePicker = () => {
    // tsvb loads without an indexPattern initially (TODO investigate).
    // hide timefilter only if timeFieldName is explicitly undefined.
    const hasTimeField = vis.data.indexPattern ? !!vis.data.indexPattern.timeFieldName : true;
    return vis.type.options.showTimePicker && hasTimeField;
  };
  const showFilterBar = vis.type.options.showFilterBar;
  const showQueryInput = vis.type.requiresSearch && vis.type.options.showQueryBar;

  useEffect(() => {
    return () => {
      if (inspectorSession) {
        // Close the inspector if this scope is destroyed (e.g. because the user navigates away).
        inspectorSession.close();
      }
    };
  }, [inspectorSession]);

  useEffect(() => {
    onAppLeave((actions) => {
      // Confirm when the user has made any changes to an existing visualizations
      // or when the user has configured something without saving
      if (
        ((originatingApp && originatingApp === 'dashboards') || originatingApp === 'canvas') &&
        (hasUnappliedChanges || hasUnsavedChanges)
      ) {
        return actions.confirm(
          i18n.translate('visualize.confirmModal.confirmTextDescription', {
            defaultMessage: 'Leave Visualize editor with unsaved changes?',
          }),
          i18n.translate('visualize.confirmModal.title', {
            defaultMessage: 'Unsaved changes',
          })
        );
      }
      return actions.default();
    });
  }, [
    onAppLeave,
    hasUnappliedChanges,
    hasUnsavedChanges,
    visualizeCapabilities.save,
    originatingApp,
  ]);

  useEffect(() => {
    const asyncSetIndexPattern = async () => {
      let indexes: IndexPattern[] | undefined;

      if (vis.type.getUsedIndexPattern) {
        indexes = await vis.type.getUsedIndexPattern(vis.params);
      }
      if (!indexes || !indexes.length) {
        const defaultIndex = await services.data.indexPatterns.getDefault();
        if (defaultIndex) {
          indexes = [defaultIndex];
        }
      }
      if (indexes) {
        setIndexPatterns(indexes);
      }
    };

    if (!vis.data.indexPattern) {
      asyncSetIndexPattern();
    }
  }, [vis.params, vis.type, services.data.indexPatterns, vis.data.indexPattern]);
  const [value, setValue] = useState('');
  const [generating, setGenerating] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const HARDCODED_SUGGESTIONS: string[] = [
    `what's the revenue for past week and group by day?`,
    'how many orders per day for past week?',
  ];

  const isVega = vis.type.name === 'vega';

  const indexName = 'opensearch_dashboards_sample_data_logs';
  const onGenerate = async () => {
    input$.next(value);
  };

  return isChromeVisible ? (
    /**
     * Most visualizations have all search bar components enabled.
     * Some visualizations have fewer options, but all visualizations have the search bar.
     * That's is why the showSearchBar prop is set.
     * All visualizations also have the timepicker\autorefresh component,
     * it is enabled by default in the TopNavMenu component.
     */
    <>
      {isVega ? (
        <EuiFlexGroup
          gutterSize="m"
          justifyContent="spaceAround"
          alignItems="center"
          style={{ maxHeight: '100px' }}
        >
          <EuiFlexItem grow={9}>
            <EuiInputPopover
              input={
                <EuiFieldText
                  inputRef={inputRef}
                  placeholder={`Ask a natural language question about ${indexName} to generate a vega visualization`}
                  value={value}
                  prepend={<EuiIcon type={chatLogo} />}
                  fullWidth
                  onChange={(event) => setValue(event.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onGenerate();
                  }}
                />
              }
              disableFocusTrap
              fullWidth={true}
              isOpen={isPopoverOpen}
              closePopover={() => {
                setIsPopoverOpen(false);
              }}
            >
              <EuiListGroup flush={true} bordered={false} wrapText={true} maxWidth={false}>
                {HARDCODED_SUGGESTIONS?.map((question) => (
                  <EuiListGroupItem
                    onClick={() => {
                      setValue(question);
                      inputRef.current?.focus();
                      setIsPopoverOpen(false);
                    }}
                    label={question}
                  />
                ))}
              </EuiListGroup>
            </EuiInputPopover>
          </EuiFlexItem>
          <EuiFlexItem grow={1}>
            <EuiButton size="s" fill onClick={() => onGenerate()} isLoading={generating}>
              {generating ? 'Generating' : 'Generate'}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : (
        <TopNavMenu
          appName={APP_NAME}
          config={config}
          setMenuMountPoint={setHeaderActionMenu}
          onQuerySubmit={handleRefresh}
          savedQueryId={currentAppState.savedQuery}
          onSavedQueryIdChange={stateContainer.transitions.updateSavedQuery}
          indexPatterns={indexPatterns}
          screenTitle={vis.title}
          showAutoRefreshOnly={!showDatePicker()}
          showDatePicker={showDatePicker()}
          showFilterBar={showFilterBar}
          showQueryInput={showQueryInput}
          showSaveQuery={services.visualizeCapabilities.saveQuery}
          showSearchBar
          useDefaultBehaviors
        />
      )}
    </>
  ) : showFilterBar ? (
    /**
     * The top nav is hidden in embed mode, but the filter bar must still be present so
     * we show the filter bar on its own here if the chrome is not visible.
     */
    <TopNavMenu
      appName={APP_NAME}
      setMenuMountPoint={setHeaderActionMenu}
      indexPatterns={indexPatterns}
      showSearchBar
      showSaveQuery={false}
      showDatePicker={false}
      showQueryInput={false}
    />
  ) : null;
};

export const VisualizeTopNav = memo(TopNav);
