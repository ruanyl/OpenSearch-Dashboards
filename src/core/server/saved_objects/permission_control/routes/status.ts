/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthStatus, InternalHttpServiceSetup, IRouter } from '../../../http';

/**
 * router to handle permission control settings
 */
export const registerStatusRoute = (router: IRouter, http: InternalHttpServiceSetup) => {
  router.get(
    {
      path: '/status',
      validate: {},
    },
    router.handleLegacyErrors(async (context, req, res) => {
      // For now, we consider permission control is enabled when `auth` interceptor is registered
      const enabled = http.auth.get(req).status !== AuthStatus.unknown;
      return res.ok({ body: { enabled } });
    })
  );
};
