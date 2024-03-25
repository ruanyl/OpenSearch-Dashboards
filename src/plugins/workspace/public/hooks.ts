/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useObservable } from 'react-use';
import { useMemo } from 'react';
import { of } from 'rxjs';
import { WorkspaceFeature, WorkspaceFeatureGroup } from './components/workspace_form/types';
import { ApplicationStart, PublicAppInfo } from '../../../core/public';
import { isWorkspaceFeatureGroup } from './components/workspace_form/utils';
import { DEFAULT_SELECTED_FEATURES_IDS } from '../common/constants';

export function useApplications(application?: ApplicationStart) {
  const applications = useObservable(application?.applications$ ?? of(new Map()), new Map());
  return useMemo(() => {
    const apps: PublicAppInfo[] = [];
    applications?.forEach((app) => {
      apps.push(app);
    });
    return apps;
  }, [applications]);
}

export function useAllWorkspaceFeatures(
  workspaceFeatureOrGroup: Array<WorkspaceFeature | WorkspaceFeatureGroup>
) {
  const registerFeatureIds = workspaceFeatureOrGroup.reduce<string[]>((acc, cur) => {
    if (isWorkspaceFeatureGroup(cur)) {
      const ids = cur.features.map((feature) => {
        return feature.id;
      });
      return acc.concat(ids);
    } else {
      acc.push(cur.id);
      return acc;
    }
  }, []);
  return registerFeatureIds.concat(DEFAULT_SELECTED_FEATURES_IDS);
}
