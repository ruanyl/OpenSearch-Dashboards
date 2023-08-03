/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { URL } from 'node:url';
import { CoreService } from '../../types';
import { CoreContext } from '../core_context';
import { InternalHttpServiceSetup } from '../http';
import { Logger } from '../logging';
import { registerRoutes } from './routes';
import { InternalSavedObjectsServiceSetup, SavedObjectsServiceStart } from '../saved_objects';
import { IWorkspaceDBImpl, WorkspaceAttribute } from './types';
import { WorkspacesClientWithSavedObject } from './workspaces_client';
import { WorkspaceSavedObjectsClientWrapper } from './saved_objects';
import { InternalUiSettingsServiceSetup } from '../ui_settings';
import { uiSettings } from './ui_settings';
import { WORKSPACE_TYPE } from './constants';
import { PUBLIC_WORKSPACE } from '../../utils';

export interface WorkspacesServiceSetup {
  client: IWorkspaceDBImpl;
}

export interface WorkspacesServiceStart {
  client: IWorkspaceDBImpl;
}

export interface WorkspacesSetupDeps {
  http: InternalHttpServiceSetup;
  savedObject: InternalSavedObjectsServiceSetup;
  uiSettings: InternalUiSettingsServiceSetup;
}

export interface WorkpsaceStartDeps {
  savedObjects: SavedObjectsServiceStart;
}

export type InternalWorkspacesServiceSetup = WorkspacesServiceSetup;
export type InternalWorkspacesServiceStart = WorkspacesServiceStart;

export class WorkspacesService
  implements CoreService<WorkspacesServiceSetup, WorkspacesServiceStart> {
  private logger: Logger;
  private client?: IWorkspaceDBImpl;

  constructor(coreContext: CoreContext) {
    this.logger = coreContext.logger.get('workspaces-service');
  }

  private proxyWorkspaceTrafficToRealHandler(setupDeps: WorkspacesSetupDeps) {
    /**
     * Proxy all {basePath}/w/{workspaceId}{osdPath*} paths to {basePath}{osdPath*}
     */
    setupDeps.http.registerOnPreRouting(async (request, response, toolkit) => {
      const regexp = /\/w\/([^\/]*)/;
      const matchedResult = request.url.pathname.match(regexp);

      if (matchedResult) {
        const requestUrl = new URL(request.url.toString());
        requestUrl.pathname = requestUrl.pathname.replace(regexp, '');
        return toolkit.rewriteUrl(requestUrl.toString());
      }
      return toolkit.next();
    });
  }

  public async setup(setupDeps: WorkspacesSetupDeps): Promise<InternalWorkspacesServiceSetup> {
    this.logger.debug('Setting up Workspaces service');

    setupDeps.uiSettings.register(uiSettings);

    this.client = new WorkspacesClientWithSavedObject(setupDeps);

    await this.client.setup(setupDeps);
    const workspaceSavedObjectsClientWrapper = new WorkspaceSavedObjectsClientWrapper(
      setupDeps.savedObject.permissionControl
    );

    setupDeps.savedObject.addClientWrapper(
      0,
      'workspace',
      workspaceSavedObjectsClientWrapper.wrapperFactory
    );

    this.proxyWorkspaceTrafficToRealHandler(setupDeps);

    registerRoutes({
      http: setupDeps.http,
      logger: this.logger,
      client: this.client as IWorkspaceDBImpl,
    });

    return {
      client: this.client,
    };
  }

  public async start(startDeps: WorkpsaceStartDeps): Promise<InternalWorkspacesServiceStart> {
    this.logger.debug('Starting SavedObjects service');
    /**
     * Internal repository is attached to global tenant.
     */
    const internalRepository = startDeps.savedObjects.createInternalRepository();

    try {
      await internalRepository.get(WORKSPACE_TYPE, PUBLIC_WORKSPACE);
    } catch (error) {
      this.logger.debug(error?.toString() || '');
      this.logger.info('No public workspace found, create it by using internal user');
      try {
        const createResult = await internalRepository.create(
          WORKSPACE_TYPE,
          {
            name: 'public',
          } as Omit<WorkspaceAttribute, 'id'>,
          {
            id: PUBLIC_WORKSPACE,
          }
        );
        if (createResult.id) {
          this.logger.info(`Created workspace ${createResult.id} in global tenant.`);
        }
      } catch (e) {
        this.logger.error(`Create public workspace error: ${e?.toString() || ''}`);
      }
    }

    return {
      client: this.client as IWorkspaceDBImpl,
    };
  }

  public async stop() {}
}
