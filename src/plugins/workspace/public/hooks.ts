/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useObservable } from 'react-use';
import { useMemo } from 'react';
import { groupBy } from 'lodash';
import { i18n } from '@osd/i18n';
import { WorkspaceFeature, WorkspaceFeatureGroup } from './components/workspace_form/types';
import {
  ApplicationStart,
  PublicAppInfo,
  DEFAULT_APP_CATEGORIES,
  AppNavLinkStatus,
} from '../../../core/public';
import { isWorkspaceFeatureGroup } from './components/workspace_form/utils';
import { DEFAULT_CHECKED_FEATURES_IDS } from '../common/constants';

export function useApplications(application: ApplicationStart) {
  const applications = useObservable(application.applications$);
  return useMemo(() => {
    const apps: PublicAppInfo[] = [];
    applications?.forEach((app) => {
      apps.push(app);
    });
    return apps;
  }, [applications]);
}

const libraryCategoryLabel = i18n.translate('core.ui.libraryNavList.label', {
  defaultMessage: 'Library',
});

export function useFeatureOrGroups(applications: PublicAppInfo[]) {
  return useMemo(() => {
    const transformedApplications = applications.map((app) => {
      if (app.category?.id === DEFAULT_APP_CATEGORIES.opensearchDashboards.id) {
        return {
          ...app,
          category: {
            ...app.category,
            label: libraryCategoryLabel,
          },
        };
      }
      return app;
    });
    const category2Applications = groupBy(transformedApplications, 'category.label');
    return Object.keys(category2Applications).reduce<
      Array<WorkspaceFeature | WorkspaceFeatureGroup>
    >((previousValue, currentKey) => {
      const apps = category2Applications[currentKey];
      const features = apps
        .filter(
          ({ navLinkStatus, chromeless, category }) =>
            navLinkStatus !== AppNavLinkStatus.hidden &&
            !chromeless &&
            category?.id !== DEFAULT_APP_CATEGORIES.management.id
        )
        .map(({ id, title }) => ({
          id,
          name: title,
        }));
      if (features.length === 0) {
        return previousValue;
      }
      if (currentKey === 'undefined') {
        return [...previousValue, ...features];
      }
      return [
        ...previousValue,
        {
          name: apps[0].category?.label || '',
          features,
        },
      ];
    }, []);
  }, [applications]);
}

export function useFeaturesQuantities(application: ApplicationStart) {
  const featureOrGroups = useFeatureOrGroups(useApplications(application));
  const totalQuantity = featureOrGroups.reduce((acc, cur) => {
    return isWorkspaceFeatureGroup(cur) ? acc + cur.features.length : acc + 1;
  }, 0);
  return totalQuantity + DEFAULT_CHECKED_FEATURES_IDS.length;
}
