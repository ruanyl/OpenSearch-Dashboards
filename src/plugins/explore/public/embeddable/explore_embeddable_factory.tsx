/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import { SavedObjectAttributes, SimpleSavedObject } from 'opensearch-dashboards/public';

import { getServices } from '../application/legacy/discover/opensearch_dashboards_services';
import {
  EmbeddableFactoryDefinition,
  Container,
  ErrorEmbeddable,
} from '../../../embeddable/public';
import {
  TimeRange,
  injectSearchSourceReferences,
  parseSearchSourceJSON,
} from '../../../data/public';
import {
  ExploreInput,
  ExploreOutput,
  ExploreByValueAttributes,
  ExploreByValueInput,
  ExploreByReferenceInput,
} from './types';
import { EXPLORE_EMBEDDABLE_TYPE } from './constants';
import { ExploreEmbeddable } from './explore_embeddable';
import { VisualizationRegistryService } from '../services/visualization_registry_service';
import { ExploreFlavor } from '../../common';
import { SavedExplore } from '../saved_explore';
import { AttributeService, DashboardStart } from '../../../dashboard/public';
import { OnSaveProps, checkForDuplicateTitle } from '../../../saved_objects/public';

interface StartServices {
  isEditable: () => boolean;
  dashboard: DashboardStart;
}

export class ExploreEmbeddableFactory
  implements EmbeddableFactoryDefinition<ExploreInput, ExploreOutput, ExploreEmbeddable> {
  public readonly type = EXPLORE_EMBEDDABLE_TYPE;
  public readonly savedObjectMetaData = {
    name: i18n.translate('explore.savedExplore.savedObjectName', {
      defaultMessage: 'Saved explore',
    }),
    type: 'explore',
    getIconForSavedObject: ({ attributes }: SimpleSavedObject<SavedObjectAttributes>) => {
      let iconType = '';
      try {
        const vis = JSON.parse(attributes.visualization as string);
        const chart = this.visualizationRegistryService
          .getRegistry()
          .getAvailableChartTypes()
          .find((t) => t.type === vis.chartType);
        if (chart) {
          iconType = chart.icon;
        }
      } catch (e) {
        iconType = '';
      }
      return iconType;
    },
    includeFields: ['kibanaSavedObjectMeta', 'visualization'],
  };

  private attributeService?: AttributeService<
    ExploreByValueAttributes,
    ExploreByValueInput,
    ExploreByReferenceInput
  >;

  constructor(
    private getStartServices: () => Promise<StartServices>,
    private readonly visualizationRegistryService: VisualizationRegistryService
  ) {}

  private async getAttributeService() {
    if (!this.attributeService) {
      const { dashboard } = await this.getStartServices();
      this.attributeService = dashboard.getAttributeService<
        ExploreByValueAttributes,
        ExploreByValueInput,
        ExploreByReferenceInput
      >(this.type, {
        saveMethod: this.saveMethod.bind(this),
        checkForDuplicateTitle: this.checkTitle.bind(this),
      });
    }
    return this.attributeService!;
  }

  private async saveMethod(
    attributes: ExploreByValueAttributes,
    savedObjectId?: string
  ): Promise<{ id: string }> {
    const services = getServices();
    const savedExplore = await services.getSavedExploreById(savedObjectId);

    savedExplore.title = attributes.title;
    savedExplore.description = attributes.description ?? '';
    savedExplore.columns = attributes.columns;
    savedExplore.sort = attributes.sort;
    savedExplore.visualization = attributes.visualization;
    savedExplore.uiState = attributes.uiState;

    if (attributes.searchSource) {
      savedExplore.searchSource = attributes.searchSource;
    }

    if (attributes.kibanaSavedObjectMeta?.searchSourceJSON) {
      savedExplore.searchSourceFields = JSON.parse(
        attributes.kibanaSavedObjectMeta.searchSourceJSON
      );
    }

    savedExplore.copyOnSave = false;
    const id = await savedExplore.save({ confirmOverwrite: false });

    if (!id) {
      throw new Error('Saving explore object failed');
    }
    return { id };
  }

  private async checkTitle(props: OnSaveProps): Promise<true> {
    const services = getServices();
    return checkForDuplicateTitle(
      {
        id: '',
        title: props.newTitle,
        copyOnSave: false,
        lastSavedTitle: '',
        getOpenSearchType: () => this.type,
        getDisplayName: () => this.getDisplayName(),
      },
      props.isTitleDuplicateConfirmed,
      props.onTitleDuplicate,
      {
        savedObjectsClient: services.savedObjects.client,
        overlays: services.overlays,
      }
    );
  }

  public canCreateNew() {
    return false;
  }

  public isEditable = async () => {
    return (await this.getStartServices()).isEditable();
  };

  public getDisplayName() {
    return i18n.translate('explore.embeddable.displayName', {
      defaultMessage: 'visualization in discover',
    });
  }

  public createFromSavedObject = async (
    savedObjectId: string,
    input: Partial<ExploreInput> & { id: string; timeRange: TimeRange },
    parent?: Container
  ): Promise<ExploreEmbeddable | ErrorEmbeddable> => {
    const services = getServices();
    const filterManager = services.filterManager;
    const url = await services.getSavedExploreUrlById(savedObjectId);

    try {
      const savedObject = await services.getSavedExploreById(savedObjectId);
      if (!savedObject) {
        throw new Error('Saved object not found');
      }
      const indexPattern = savedObject.searchSource.getField('index');
      const { ExploreEmbeddable: ExploreEmbeddableClass } = await import('./explore_embeddable');
      const flavor = savedObject.type ?? ExploreFlavor.Logs;
      const editUrl = services.addBasePath(`/app/explore/${flavor}/${url}`);

      return new ExploreEmbeddableClass(
        {
          savedExplore: savedObject,
          editUrl,
          editPath: url,
          filterManager,
          editable: services.capabilities.discover?.save as boolean,
          indexPatterns: indexPattern ? [indexPattern] : [],
          services,
          editApp: `explore/${flavor}`,
        },
        input,
        await this.getAttributeService(),
        parent
      );
    } catch (e) {
      console.error(e); // eslint-disable-line no-console
      return new ErrorEmbeddable(e, input, parent);
    }
  };

  public async create(
    input: ExploreInput,
    parent?: Container
  ): Promise<ExploreEmbeddable | ErrorEmbeddable> {
    if (!input.attributes) {
      return new ErrorEmbeddable(
        'Attributes are required. Use createFromSavedObject to create from a saved object id',
        input,
        parent
      );
    }

    const services = getServices();
    const filterManager = services.filterManager;
    const attributes = input.attributes;
    const references = input.references || [];

    try {
      let searchSourceValues = parseSearchSourceJSON(
        attributes.kibanaSavedObjectMeta!.searchSourceJSON
      );
      searchSourceValues = injectSearchSourceReferences(searchSourceValues, references);
      const searchSource = await services.data.search.searchSource.create(searchSourceValues);
      const indexPattern = searchSource.getField('index');

      const savedExplore = await services.getSavedExploreById();
      savedExplore.title = input.attributes?.title;
      savedExplore.description = input.attributes?.description;
      savedExplore.columns = input.attributes?.columns;
      savedExplore.sort = input.attributes?.sort;
      savedExplore.type = input.attributes?.type;
      savedExplore.visualization = input.attributes?.visualization;
      savedExplore.uiState = input.attributes?.uiState;
      savedExplore.searchSource = searchSource;

      const { ExploreEmbeddable: ExploreEmbeddableClass } = await import('./explore_embeddable');
      const flavor = savedExplore.type;

      return new ExploreEmbeddableClass(
        {
          savedExplore,
          editUrl: '',
          editPath: '',
          filterManager,
          editable: false,
          indexPatterns: indexPattern ? [indexPattern] : [],
          services,
          editApp: `explore/${flavor}`,
        },
        input,
        await this.getAttributeService(),
        parent
      );
    } catch (e) {
      return new ErrorEmbeddable(e, input, parent);
    }
  }
}
