/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiSpacer, EuiTitle } from '@elastic/eui';

import { WorkspaceForm } from './workspace_form';
import { defaultTemplates, defaultFeatureOrGroups } from './sample_data';

export const WorkspaceCreator = () => {
  return (
    <div>
      <EuiTitle>
        <h1>Create Workspace</h1>
      </EuiTitle>
      <EuiSpacer />
      <WorkspaceForm templates={defaultTemplates} featureOrGroups={defaultFeatureOrGroups} />
    </div>
  );
};
