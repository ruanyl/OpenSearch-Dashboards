/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useObservable } from 'react-use';
import { useMemo } from 'react';
import { of } from 'rxjs';
import { ApplicationStart, PublicAppInfo } from '../../../core/public';

const emptyMap = new Map();

export function useApplications(application?: ApplicationStart) {
  const applications = useObservable(application?.applications$ ?? of(emptyMap), emptyMap);
  return useMemo(() => {
    const apps: PublicAppInfo[] = [];
    applications.forEach((app) => {
      apps.push(app);
    });
    return apps;
  }, [applications]);
}
