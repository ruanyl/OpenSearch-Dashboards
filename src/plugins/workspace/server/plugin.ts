/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { i18n } from '@osd/i18n';
import { BehaviorSubject, Observable } from 'rxjs';

import {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
  ISavedObjectsRepository,
  WORKSPACE_TYPE,
  ACL,
  PUBLIC_WORKSPACE_ID,
  MANAGEMENT_WORKSPACE_ID,
  Permissions,
  WorkspacePermissionMode,
  SavedObjectsClient,
  WorkspaceAttribute,
  DEFAULT_APP_CATEGORIES,
} from '../../../core/server';
import { IWorkspaceDBImpl } from './types';
import { WorkspaceClientWithSavedObject } from './workspace_client';
import { WorkspaceSavedObjectsClientWrapper } from './saved_objects';
import { registerRoutes } from './routes';
import { WORKSPACE_OVERVIEW_APP_ID, WORKSPACE_UPDATE_APP_ID } from '../common/constants';
import { ConfigSchema, FEATURE_FLAG_KEY_IN_UI_SETTING } from '../config';

const CONFIG_TYPE = 'config';

export class WorkspacePlugin implements Plugin<{}, {}> {
  private readonly logger: Logger;
  private client?: IWorkspaceDBImpl;
  private coreStart?: CoreStart;
  private config$: Observable<ConfigSchema>;
  private enabled$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private version: string;

  private get isEnabled() {
    return this.enabled$.getValue();
  }

  private proxyWorkspaceTrafficToRealHandler(setupDeps: CoreSetup) {
    /**
     * Proxy all {basePath}/w/{workspaceId}{osdPath*} paths to {basePath}{osdPath*}
     */
    setupDeps.http.registerOnPreRouting(async (request, response, toolkit) => {
      if (!this.isEnabled) {
        return toolkit.next();
      }
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

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get('plugins', 'workspace');
    this.config$ = initializerContext.config.create<ConfigSchema>();
    this.version = initializerContext.env.packageInfo.version;
  }

  public async setup(core: CoreSetup) {
    this.logger.debug('Setting up Workspaces service');

    this.client = new WorkspaceClientWithSavedObject(core);

    await this.client.setup(core);
    const workspaceSavedObjectsClientWrapper = new WorkspaceSavedObjectsClientWrapper(
      core.savedObjects.permissionControl,
      {
        config$: this.config$,
      }
    );

    core.savedObjects.addClientWrapper(
      0,
      'workspace',
      workspaceSavedObjectsClientWrapper.wrapperFactory
    );

    this.proxyWorkspaceTrafficToRealHandler(core);

    registerRoutes({
      http: core.http,
      logger: this.logger,
      client: this.client as IWorkspaceDBImpl,
      enabled$: this.enabled$,
      config$: this.config$,
    });

    core.savedObjects.setClientFactoryProvider(
      (repositoryFactory) => ({ request, includedHiddenTypes }) => {
        const enabled = this.isEnabled;
        if (enabled) {
          return new SavedObjectsClient(repositoryFactory.createInternalRepository());
        }

        return new SavedObjectsClient(
          repositoryFactory.createScopedRepository(request, includedHiddenTypes)
        );
      }
    );

    return {
      client: this.client,
      enabled$: this.enabled$,
      setWorkspaceFeatureFlag: this.setWorkspaceFeatureFlag,
    };
  }

  private async checkAndCreateWorkspace(
    internalRepository: ISavedObjectsRepository,
    workspaceId: string,
    workspaceAttribute: Omit<WorkspaceAttribute, 'id' | 'permissions'>,
    permissions?: Permissions
  ) {
    /**
     * Internal repository is attached to global tenant.
     */
    try {
      await internalRepository.get(WORKSPACE_TYPE, workspaceId);
    } catch (error) {
      this.logger.debug(error?.toString() || '');
      this.logger.info(`Workspace ${workspaceId} is not found, create it by using internal user`);
      try {
        const createResult = await internalRepository.create(WORKSPACE_TYPE, workspaceAttribute, {
          id: workspaceId,
          permissions,
        });
        if (createResult.id) {
          this.logger.info(`Created workspace ${createResult.id} in global tenant.`);
        }
      } catch (e) {
        this.logger.error(`Create ${workspaceId} workspace error: ${e?.toString() || ''}`);
      }
    }
  }

  private async setupWorkspaces() {
    if (!this.coreStart) {
      throw new Error('Repository client can not be found');
    }
    const internalRepository = this.coreStart.savedObjects.createInternalRepository();
    this.client?.setInternalRepository(internalRepository);
    const publicWorkspaceACL = new ACL().addPermission(
      [WorkspacePermissionMode.LibraryRead, WorkspacePermissionMode.LibraryWrite],
      {
        users: ['*'],
      }
    );
    const managementWorkspaceACL = new ACL().addPermission([WorkspacePermissionMode.LibraryRead], {
      users: ['*'],
    });

    await Promise.all([
      this.checkAndCreateWorkspace(
        internalRepository,
        PUBLIC_WORKSPACE_ID,
        {
          name: i18n.translate('workspaces.public.workspace.default.name', {
            defaultMessage: 'public',
          }),
          features: ['*', `!@${DEFAULT_APP_CATEGORIES.management.id}`],
        },
        publicWorkspaceACL.getPermissions()
      ),
      this.checkAndCreateWorkspace(
        internalRepository,
        MANAGEMENT_WORKSPACE_ID,
        {
          name: i18n.translate('workspaces.management.workspace.default.name', {
            defaultMessage: 'Management',
          }),
          features: [
            `@${DEFAULT_APP_CATEGORIES.management.id}`,
            WORKSPACE_OVERVIEW_APP_ID,
            WORKSPACE_UPDATE_APP_ID,
          ],
        },
        managementWorkspaceACL.getPermissions()
      ),
    ]);
  }

  private getInternalRepository() {
    if (!this.coreStart) {
      throw new Error('UI setting client can not be found');
    }
    const { savedObjects } = this.coreStart as CoreStart;

    return savedObjects.createInternalRepository();
  }

  private async getUISettingClient() {
    if (!this.coreStart) {
      throw new Error('UI setting client can not be found');
    }
    const { uiSettings } = this.coreStart as CoreStart;
    const internalRepository = this.getInternalRepository();
    const savedObjectClient = new SavedObjectsClient(internalRepository);
    return uiSettings.asScopedToClient(savedObjectClient);
  }

  private async setWorkspaceFeatureFlag(featureFlag: boolean) {
    const uiSettingClient = await this.getUISettingClient();
    await uiSettingClient.set(FEATURE_FLAG_KEY_IN_UI_SETTING, featureFlag);
    this.enabled$.next(featureFlag);
  }

  private async setupWorkspaceFeatureFlag() {
    const internalRepository = this.getInternalRepository();
    try {
      /**
       * We can not use ui settings client here as the client will create a advanced config if there is not when just calling "get"
       */
      const config = await internalRepository.get<Record<string, any>>(CONFIG_TYPE, this.version);
      const workspaceEnabled = !!config.attributes[FEATURE_FLAG_KEY_IN_UI_SETTING];
      this.enabled$.next(workspaceEnabled);
    } catch (e) {
      this.enabled$.next(false);
    }
  }

  private async setupUISettinsACL() {
    const internalRepository = this.getInternalRepository();
    try {
      await internalRepository.get(CONFIG_TYPE, this.version);
    } catch (e) {
      return;
    }

    if (this.isEnabled) {
      const acl = new ACL().addPermission([WorkspacePermissionMode.Read], {
        users: ['*'],
      });
      await internalRepository.update(
        CONFIG_TYPE,
        this.version,
        {},
        {
          permissions: acl.getPermissions(),
        }
      );
    } else {
      await internalRepository.deleteACL(CONFIG_TYPE, this.version);
    }
  }

  public async start(core: CoreStart) {
    this.logger.debug('Starting SavedObjects service');

    this.coreStart = core;

    await this.setupWorkspaceFeatureFlag();

    this.enabled$.subscribe((enabled) => {
      if (enabled) {
        this.setupWorkspaces();
      }
      this.setupUISettinsACL();
    });

    return {
      client: this.client as IWorkspaceDBImpl,
      enabled$: this.enabled$,
      setWorkspaceFeatureFlag: this.setWorkspaceFeatureFlag,
    };
  }

  public stop() {
    this.enabled$.unsubscribe();
  }
}
