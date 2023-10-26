/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  featureMatchesConfig,
  isFeatureDependBySelectedFeatures,
  getFinalFeatureIdsByDependency,
  generateFeatureDependencyMap,
} from './utils';

describe('workspace utils: featureMatchesConfig', () => {
  it('feature configured with `*` should match any features', () => {
    const match = featureMatchesConfig(['*']);
    expect(match({ id: 'dev_tools', category: { id: 'management', label: 'Management' } })).toBe(
      true
    );
    expect(
      match({ id: 'discover', category: { id: 'opensearchDashboards', label: 'Library' } })
    ).toBe(true);
  });

  it('should NOT match the config if feature id not matches', () => {
    const match = featureMatchesConfig(['discover', 'dashboards', 'visualize']);
    expect(match({ id: 'dev_tools', category: { id: 'management', label: 'Management' } })).toBe(
      false
    );
  });

  it('should match the config if feature id matches', () => {
    const match = featureMatchesConfig(['discover', 'dashboards', 'visualize']);
    expect(
      match({ id: 'discover', category: { id: 'opensearchDashboards', label: 'Library' } })
    ).toBe(true);
  });

  it('should match the config if feature category matches', () => {
    const match = featureMatchesConfig(['discover', 'dashboards', '@management', 'visualize']);
    expect(match({ id: 'dev_tools', category: { id: 'management', label: 'Management' } })).toBe(
      true
    );
  });

  it('should match any features but not the excluded feature id', () => {
    const match = featureMatchesConfig(['*', '!discover']);
    expect(match({ id: 'dev_tools', category: { id: 'management', label: 'Management' } })).toBe(
      true
    );
    expect(
      match({ id: 'discover', category: { id: 'opensearchDashboards', label: 'Library' } })
    ).toBe(false);
  });

  it('should match any features but not the excluded feature category', () => {
    const match = featureMatchesConfig(['*', '!@management']);
    expect(match({ id: 'dev_tools', category: { id: 'management', label: 'Management' } })).toBe(
      false
    );
    expect(match({ id: 'integrations', category: { id: 'management', label: 'Management' } })).toBe(
      false
    );
    expect(
      match({ id: 'discover', category: { id: 'opensearchDashboards', label: 'Library' } })
    ).toBe(true);
  });

  it('should NOT match the excluded feature category', () => {
    const match = featureMatchesConfig(['!@management']);
    expect(match({ id: 'dev_tools', category: { id: 'management', label: 'Management' } })).toBe(
      false
    );
    expect(match({ id: 'integrations', category: { id: 'management', label: 'Management' } })).toBe(
      false
    );
  });

  it('should match features of a category but NOT the excluded feature', () => {
    const match = featureMatchesConfig(['@management', '!dev_tools']);
    expect(match({ id: 'dev_tools', category: { id: 'management', label: 'Management' } })).toBe(
      false
    );
    expect(match({ id: 'integrations', category: { id: 'management', label: 'Management' } })).toBe(
      true
    );
  });

  it('a config presents later in the config array should override the previous config', () => {
    // though `dev_tools` is excluded, but this config will override by '@management' as dev_tools has category 'management'
    const match = featureMatchesConfig(['!dev_tools', '@management']);
    expect(match({ id: 'dev_tools', category: { id: 'management', label: 'Management' } })).toBe(
      true
    );
    expect(match({ id: 'integrations', category: { id: 'management', label: 'Management' } })).toBe(
      true
    );
  });
});

describe('workspace utils: isFeatureDependBySelectedFeatures', () => {
  it('should return true', () => {
    expect(isFeatureDependBySelectedFeatures('a', ['b'], { b: ['a'] })).toBe(true);
    expect(isFeatureDependBySelectedFeatures('a', ['b'], { b: ['a', 'c'] })).toBe(true);
  });
  it('should return false', () => {
    expect(isFeatureDependBySelectedFeatures('a', ['b'], { b: ['c'] })).toBe(false);
    expect(isFeatureDependBySelectedFeatures('a', ['b'], {})).toBe(false);
  });
});

describe('workspace utils: getFinalFeatureIdsByDependency', () => {
  it('should return consistent feature ids', () => {
    expect(getFinalFeatureIdsByDependency(['a'], { a: ['b'] }, ['c', 'd'])).toStrictEqual([
      'c',
      'd',
      'a',
      'b',
    ]);
    expect(getFinalFeatureIdsByDependency(['a'], { a: ['b', 'e'] }, ['c', 'd'])).toStrictEqual([
      'c',
      'd',
      'a',
      'b',
      'e',
    ]);
  });
});
describe('workspace utils: generateFeatureDependencyMap', () => {
  it('should generate consistent features dependency map', () => {
    expect(
      generateFeatureDependencyMap([
        { id: 'a', dependencies: { b: { type: 'required' }, c: { type: 'optional' } } },
        { id: 'b', dependencies: { c: { type: 'required' } } },
      ])
    ).toEqual({
      a: ['b'],
      b: ['c'],
    });
  });
});
