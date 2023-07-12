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
import {
  InternalSavedObjectsServiceSetup,
  InternalSavedObjectsServiceStart,
} from '../saved_objects';
import { IWorkspaceDBImpl } from './types';
import { WorkspacesClientWithSavedObject } from './workspaces_client';
import { WorkspacePermissionControl } from './workspace_permission_control';
import { UiSettingsServiceStart } from '../ui_settings/types';
import { WORKSPACE_TEMP_JUMP_QUERYSTRING } from './constants';
import { WORKSPACE_PATH_PREFIX } from '../../utils';

export interface WorkspacesServiceSetup {
  client: IWorkspaceDBImpl;
  permissionControl: WorkspacePermissionControl;
}

export interface WorkspacesServiceStart {
  client: IWorkspaceDBImpl;
  permissionControl: WorkspacePermissionControl;
}

export interface WorkspacesSetupDeps {
  http: InternalHttpServiceSetup;
  savedObject: InternalSavedObjectsServiceSetup;
}

export type InternalWorkspacesServiceSetup = WorkspacesServiceSetup;
export type InternalWorkspacesServiceStart = WorkspacesServiceStart;

/** @internal */
export interface WorkspacesStartDeps {
  savedObjects: InternalSavedObjectsServiceStart;
  uiSettings: UiSettingsServiceStart;
}

export class WorkspacesService
  implements CoreService<WorkspacesServiceSetup, WorkspacesServiceStart> {
  private logger: Logger;
  private client?: IWorkspaceDBImpl;
  private permissionControl?: WorkspacePermissionControl;
  private startDeps?: WorkspacesStartDeps;
  constructor(coreContext: CoreContext) {
    this.logger = coreContext.logger.get('workspaces-service');
  }

  private proxyWorkspaceTrafficToRealHandler(setupDeps: WorkspacesSetupDeps) {
    /**
     * Proxy all {basePath}/w/{workspaceId}{osdPath*} paths to
     * {basePath}{osdPath*} when workspace is enabled
     *
     * Return HTTP 404 if accessing {basePath}/w/{workspaceId} when workspace is disabled
     */
    setupDeps.http.registerOnPreRouting(async (request, response, toolkit) => {
      const regexp = /\/w\/([^\/]*)/;

      /**
       * If search params has _workspace_id_
       * redirect to a url where workspace id is retained in path
       */
      if (request.url.searchParams.get(WORKSPACE_TEMP_JUMP_QUERYSTRING)) {
        const requestUrl = new URL(request.url.toString());
        requestUrl.searchParams.delete(WORKSPACE_TEMP_JUMP_QUERYSTRING);
        requestUrl.pathname = setupDeps.http.basePath.prepend(
          `${WORKSPACE_PATH_PREFIX}/${request.url.searchParams.get(
            WORKSPACE_TEMP_JUMP_QUERYSTRING
          )}` + setupDeps.http.basePath.remove(requestUrl.pathname).replace(regexp, '')
        );
        return response.redirected({
          headers: {
            location: requestUrl.toString(),
          },
        });
      }
      const matchedResult = request.url.pathname.match(regexp);

      if (matchedResult) {
        if (this.startDeps) {
          const savedObjectsClient = this.startDeps.savedObjects.getScopedClient(request);
          const uiSettingsClient = this.startDeps.uiSettings.asScopedToClient(savedObjectsClient);
          const workspacesEnabled = await uiSettingsClient.get<boolean>('workspace:enabled');

          if (workspacesEnabled) {
            const requestUrl = new URL(request.url.toString());
            requestUrl.pathname = requestUrl.pathname.replace(regexp, '');
            return toolkit.rewriteUrl(requestUrl.toString());
          } else {
            // If workspace was disable, return HTTP 404
            return response.notFound();
          }
        }
      }
      return toolkit.next();
    });
  }

  public async setup(setupDeps: WorkspacesSetupDeps): Promise<InternalWorkspacesServiceSetup> {
    this.logger.debug('Setting up Workspaces service');

    this.client = new WorkspacesClientWithSavedObject(setupDeps);
    this.permissionControl = new WorkspacePermissionControl();

    await this.client.setup(setupDeps);
    await this.permissionControl.setup();

    this.proxyWorkspaceTrafficToRealHandler(setupDeps);

    registerRoutes({
      http: setupDeps.http,
      logger: this.logger,
      client: this.client as IWorkspaceDBImpl,
    });

    return {
      client: this.client,
      permissionControl: this.permissionControl,
    };
  }

  public async start(deps: WorkspacesStartDeps): Promise<InternalWorkspacesServiceStart> {
    this.startDeps = deps;
    this.logger.debug('Starting SavedObjects service');

    return {
      client: this.client as IWorkspaceDBImpl,
      permissionControl: this.permissionControl as WorkspacePermissionControl,
    };
  }

  public async stop() {}
}
