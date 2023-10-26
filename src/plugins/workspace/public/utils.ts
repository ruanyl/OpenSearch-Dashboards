/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppCategory, App } from '../../../core/public';

/**
 * Given a list of feature config, check if a feature matches config
 * Rules:
 * 1. `*` matches any feature
 * 2. config starts with `@` matches category, for example, @management matches any feature of `management` category
 * 3. to match a specific feature, just use the feature id, such as `discover`
 * 4. to exclude feature or category, use `!@management` or `!discover`
 * 5. the order of featureConfig array matters, from left to right, the later config override the previous config,
 * for example, ['!@management', '*'] matches any feature because '*' overrides the previous setting: '!@management'
 */
export const featureMatchesConfig = (featureConfigs: string[]) => ({
  id,
  category,
}: {
  id: string;
  category?: AppCategory;
}) => {
  let matched = false;

  for (const featureConfig of featureConfigs) {
    // '*' matches any feature
    if (featureConfig === '*') {
      matched = true;
    }

    // The config starts with `@` matches a category
    if (category && featureConfig === `@${category.id}`) {
      matched = true;
    }

    // The config matches a feature id
    if (featureConfig === id) {
      matched = true;
    }

    // If a config starts with `!`, such feature or category will be excluded
    if (featureConfig.startsWith('!')) {
      if (category && featureConfig === `!@${category.id}`) {
        matched = false;
      }

      if (featureConfig === `!${id}`) {
        matched = false;
      }
    }
  }

  return matched;
};

export const isFeatureDependBySelectedFeatures = (
  featureId: string,
  selectedFeatureIds: string[],
  featureDependencies: { [key: string]: string[] }
) =>
  selectedFeatureIds.some((selectedFeatureId) =>
    (featureDependencies[selectedFeatureId] || []).some((dependencies) =>
      dependencies.includes(featureId)
    )
  );

/**
 *
 * Generate new feature id list based the old feature id list
 * and feature dependencies map. The feature dependency map may
 * has duplicate ids with old feature id list. Use set here to
 * get the unique feature ids.
 *
 * @param featureIds a feature id list need to add based old feature id list
 * @param featureDependencies a feature dependencies map to get depended feature ids
 * @param oldFeatureIds a feature id list that represent current feature id selection states
 */
export const getFinalFeatureIdsByDependency = (
  featureIds: string[],
  featureDependencies: { [key: string]: string[] },
  oldFeatureIds: string[] = []
) =>
  Array.from(
    new Set([
      ...oldFeatureIds,
      ...featureIds.reduce(
        (pValue, featureId) => [...pValue, ...(featureDependencies[featureId] || [])],
        featureIds
      ),
    ])
  );

export const generateFeatureDependencyMap = (
  allFeatures: Array<Pick<App, 'id' | 'dependencies'>>
) =>
  allFeatures.reduce<{ [key: string]: string[] }>(
    (pValue, { id, dependencies }) =>
      dependencies
        ? {
            ...pValue,
            [id]: [
              ...(pValue[id] || []),
              ...Object.keys(dependencies).filter((key) => dependencies[key].type === 'required'),
            ],
          }
        : pValue,
    {}
  );
