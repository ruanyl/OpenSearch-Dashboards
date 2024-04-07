/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AppCategory,
  PublicAppInfo,
  AppNavLinkStatus,
  DEFAULT_APP_CATEGORIES,
} from '../../../core/public';

/**
 * Checks if a given feature matches the provided feature configuration.
 *
 * Rules:
 * 1. `*` matches any feature.
 * 2. Config starts with `@` matches category, for example, @management matches any feature of `management` category,
 * 3. To match a specific feature, use the feature id, such as `discover`,
 * 4. To exclude a feature or category, prepend with `!`, e.g., `!discover` or `!@management`.
 * 5. The order of featureConfig array matters. From left to right, later configs override the previous ones.
 *    For example, ['!@management', '*'] matches any feature because '*' overrides the previous setting: '!@management'.
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

// Get all apps excluding management category
export const getAllExcludingManagementApps = (applications: PublicAppInfo[]): PublicAppInfo[] => {
  return applications.filter(
    ({ navLinkStatus, chromeless, category }) =>
      navLinkStatus !== AppNavLinkStatus.hidden &&
      !chromeless &&
      category?.id !== DEFAULT_APP_CATEGORIES.management.id
  );
};

export const getSelectedFeatureQuantities = (
  featuresConfig: string[],
  applications: PublicAppInfo[]
) => {
  const visibleApplications = getAllExcludingManagementApps(applications);
  const featureFilter = featureMatchesConfig(featuresConfig);
  const selectedApplications = visibleApplications.filter((app) => featureFilter(app));
  return {
    total: visibleApplications.length,
    selected: selectedApplications.length,
  };
};
