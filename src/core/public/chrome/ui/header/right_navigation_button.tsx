/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButtonIcon } from '@elastic/eui';
import React from 'react';
import { CoreStart } from 'src/core/public';

export interface RightNavigationButtonProps {
  application: CoreStart['application'];
  http: CoreStart['http'];
  appId: string;
  iconType: string;
  title: string;
}

export const RightNavigationButton = ({
  application,
  http,
  appId,
  iconType,
  title,
}: RightNavigationButtonProps) => {
  const navigateToApp = () => {
    const appUrl = application.getUrlForApp(appId, {
      path: '/',
      absolute: false,
    });
    // Remove prefix in Url including workspace and other prefix
    const targetUrl = http.basePath.prepend(http.basePath.remove(appUrl), {
      withoutClientBasePath: true,
    });
    application.navigateToUrl(targetUrl);
  };

  return (
    <EuiButtonIcon
      iconType={iconType}
      data-test-subj="rightNavigationButton"
      aria-label={title}
      title={title}
      onClick={navigateToApp}
      style={{
        height: '48px',
        minWidth: '48px',
      }}
    />
  );
};
