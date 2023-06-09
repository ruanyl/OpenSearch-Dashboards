/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const defaultTemplates = [
  {
    name: 'Search',
    image: '',
    description:
      'Intro paragraph blur about observability, key features, and why you’d want to create an observability workspace.',
    keyFeatures: ['Logs', 'Applications', 'Metrics', 'Synthetics', 'Traces', 'Etc'],
  },
  {
    name: 'Observability',
    image: '',
    description:
      'Intro paragraph blur about observability, key features, and why you’d want to create an observability workspace.',
    keyFeatures: ['Logs', 'Applications', 'Metrics', 'Synthetics', 'Traces', 'Etc'],
  },
  {
    name: 'Security Analytics',
    image: '',
    description:
      'Intro paragraph blur about observability, key features, and why you’d want to create an observability workspace.',
    keyFeatures: ['Logs', 'Applications', 'Metrics', 'Synthetics', 'Traces', 'Etc'],
  },
  {
    name: 'General Analytics',
    image: '',
    description:
      'Intro paragraph blur about observability, key features, and why you’d want to create an observability workspace.',
    keyFeatures: ['Logs', 'Applications', 'Metrics', 'Synthetics', 'Traces', 'Etc'],
  },
];

export const defaultFeatureOrGroups = [
  {
    name: 'Analytics',
    features: [
      { id: '1', name: 'Data Explorer', template: ['Observability'] },
      { id: '2', name: 'Dashboard', template: ['Observability'] },
      { id: '3', name: 'Visualize', template: ['Observability'] },
      { id: '4', name: 'Maps', template: ['Observability'] },
    ],
  },
  {
    name: 'Observability',
    features: [
      { id: '5', name: 'Logs', template: ['Observability'] },
      { id: '6', name: 'Metrics', template: ['Observability'] },
      { id: '7', name: 'Traces', template: ['Observability'] },
      { id: '8', name: 'Applications', template: ['Observability'] },
    ],
  },
  {
    name: 'Alerting',
    features: [
      { id: '9', name: 'Alerts', template: [] },
      { id: '10', name: 'Monitories', template: [] },
    ],
  },
  {
    name: 'Security Analytics',
    features: [
      { id: '11', name: 'Findings', template: [] },
      { id: '12', name: 'Alerts', template: [] },
      { id: '13', name: 'Detectors', template: [] },
      { id: '14', name: 'Rules', template: [] },
    ],
  },
  { id: '15', name: 'Notifications', template: [] },
  {
    name: 'Machine Learning',
    features: [
      { id: '16', name: 'Detectors', template: [] },
      { id: '17', name: 'Models', template: [] },
      { id: '18', name: 'etc', template: [] },
    ],
  },
];
