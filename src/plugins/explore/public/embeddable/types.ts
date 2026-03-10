/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectReference } from 'opensearch-dashboards/public';
import {
  Embeddable,
  EmbeddableInput,
  EmbeddableOutput,
  SavedObjectEmbeddableInput,
} from '../../../embeddable/public';
import { Filter, IIndexPattern, ISearchSource, TimeRange } from '../../../data/public';
import { QueryState } from '../application/utils/state_management/slices';
import { SortOrder, SavedExplore } from '../types/saved_explore_types';
import { ATTRIBUTE_SERVICE_KEY } from '../../../dashboard/public';

export interface ExploreInput extends EmbeddableInput {
  // timeRange: TimeRange;
  query?: QueryState;
  // filters?: Filter[];
  // hidePanelTitles?: boolean;
  columns?: string[];
  sort?: SortOrder[];
  attributes?: ExploreByValueAttributes;
  references?: SavedObjectReference[];
}

export interface ExploreOutput extends EmbeddableOutput {
  editUrl: string;
  indexPatterns?: IIndexPattern[];
  editable: boolean;
}

export interface ExploreEmbeddable extends Embeddable<ExploreInput, ExploreOutput> {
  type: string;
}

export type ExploreByValueAttributes = Pick<
  SavedExplore,
  | 'title'
  | 'description'
  | 'columns'
  | 'sort'
  | 'type'
  | 'visualization'
  | 'uiState'
  | 'kibanaSavedObjectMeta'
> & {
  searchSource?: ISearchSource;
};

export type ExploreByValueInput = {
  [ATTRIBUTE_SERVICE_KEY]: ExploreByValueAttributes;
} & ExploreInput;

export type ExploreByReferenceInput = SavedObjectEmbeddableInput & ExploreInput;
