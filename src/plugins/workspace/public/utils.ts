/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WORKSPACE_PATH_PREFIX } from '../../../core/public/utils';
import { AppCategory, IBasePath } from '../../../core/public';

export const formatUrlWithWorkspaceId = (
  url: string,
  workspaceId: string,
  basePath?: IBasePath
) => {
  const newUrl = new URL(url, window.location.href);
  /**
   * Patch workspace id into path
   */
  newUrl.pathname = basePath?.remove(newUrl.pathname) || '';
  if (workspaceId) {
    newUrl.pathname = `${WORKSPACE_PATH_PREFIX}/${workspaceId}${newUrl.pathname}`;
  } else {
    newUrl.pathname = newUrl.pathname.replace(/^\/w\/([^\/]*)/, '');
  }

  newUrl.pathname =
    basePath?.prepend(newUrl.pathname, {
      withoutWorkspace: true,
    }) || '';

  return newUrl.toString();
};

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
