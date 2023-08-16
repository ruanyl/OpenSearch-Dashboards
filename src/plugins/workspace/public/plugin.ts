/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import type { Subscription } from 'rxjs';
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ApplicationStart,
  AppMountParameters,
  AppNavLinkStatus,
  ChromeNavLink,
  CoreSetup,
  CoreStart,
  Plugin,
  WorkspaceAttribute,
  DEFAULT_APP_CATEGORIES,
  HttpSetup,
} from '../../../core/public';
import {
  WORKSPACE_LIST_APP_ID,
  WORKSPACE_UPDATE_APP_ID,
  WORKSPACE_CREATE_APP_ID,
  WORKSPACE_OVERVIEW_APP_ID,
  WORKSPACE_NAV_CATEGORY,
  WORKSPACE_FATAL_ERROR_APP_ID,
} from '../common/constants';
import { mountDropdownList } from './mount';
import { SavedObjectsManagementPluginSetup } from '../../saved_objects_management/public';
import { getWorkspaceColumn } from './components/utils/workspace_column';
import { getWorkspaceIdFromUrl } from '../../../core/public/utils';
import { formatUrlWithWorkspaceId } from './utils';
import { WorkspaceClient } from './workspace_client';
import { Services } from './application';

interface WorkspacePluginSetupDeps {
  savedObjectsManagement?: SavedObjectsManagementPluginSetup;
}

export class WorkspacePlugin implements Plugin<{}, {}, WorkspacePluginSetupDeps> {
  private coreStart?: CoreStart;
  private currentWorkspaceSubscription?: Subscription;
  private getWorkspaceIdFromURL(): string | null {
    return getWorkspaceIdFromUrl(window.location.href);
  }
  public async setup(core: CoreSetup, { savedObjectsManagement }: WorkspacePluginSetupDeps) {
    const workspaceClient = new WorkspaceClient(core.http, core.workspaces);
    workspaceClient.init();

    /**
     * Retrieve workspace id from url
     */
    const workspaceId = this.getWorkspaceIdFromURL();

    if (workspaceId) {
      const result = await workspaceClient.enterWorkspace(workspaceId);
      if (!result.success) {
        /**
         * Fatal error service does not support customized actions
         * So we have to use a self-hosted page to show the errors and redirect.
         */
        (async () => {
          const [{ application, chrome }] = await core.getStartServices();
          chrome.setIsVisible(false);
          application.navigateToApp(WORKSPACE_FATAL_ERROR_APP_ID, {
            replace: true,
            state: {
              error: result.error,
            },
          });
        })();
      } else {
        /**
         * If the workspace id is valid and user is currently on workspace_fatal_error page,
         * we should redirect user to overview page of workspace.
         */
        (async () => {
          const [{ application }] = await core.getStartServices();
          const currentAppIdSubscription = application.currentAppId$.subscribe((currentAppId) => {
            if (currentAppId === WORKSPACE_FATAL_ERROR_APP_ID) {
              application.navigateToApp(WORKSPACE_OVERVIEW_APP_ID);
            }
            currentAppIdSubscription.unsubscribe();
          });
        })();
      }
    }
    /**
     * register workspace column into saved objects table
     */
    savedObjectsManagement?.columns.register(getWorkspaceColumn(core));

    // register apps for library object management
    savedObjectsManagement?.registerLibrarySubApp();

    type WorkspaceAppType = (params: AppMountParameters, services: Services) => () => void;
    const mountWorkspaceApp = async (params: AppMountParameters, renderApp: WorkspaceAppType) => {
      const [coreStart] = await core.getStartServices();
      const services = {
        ...coreStart,
        workspaceClient,
      };

      return renderApp(params, services);
    };

    // create
    core.application.register({
      id: WORKSPACE_CREATE_APP_ID,
      title: i18n.translate('workspace.settings.workspaceCreate', {
        defaultMessage: 'Create Workspace',
      }),
      navLinkStatus: AppNavLinkStatus.hidden,
      async mount(params: AppMountParameters) {
        const { renderCreatorApp } = await import('./application');
        return mountWorkspaceApp(params, renderCreatorApp);
      },
    });

    // overview
    core.application.register({
      id: WORKSPACE_OVERVIEW_APP_ID,
      title: i18n.translate('workspace.settings.workspaceOverview', {
        defaultMessage: 'Home',
      }),
      order: 0,
      euiIconType: 'home',
      navLinkStatus: AppNavLinkStatus.default,
      async mount(params: AppMountParameters) {
        const { renderOverviewApp } = await import('./application');
        return mountWorkspaceApp(params, renderOverviewApp);
      },
    });

    // update
    core.application.register({
      id: WORKSPACE_UPDATE_APP_ID,
      title: i18n.translate('workspace.settings.workspaceUpdate', {
        defaultMessage: 'Workspace Settings',
      }),
      euiIconType: 'managementApp',
      navLinkStatus: AppNavLinkStatus.default,
      async mount(params: AppMountParameters) {
        const { renderUpdateApp } = await import('./application');
        return mountWorkspaceApp(params, renderUpdateApp);
      },
    });

    // list
    core.application.register({
      id: WORKSPACE_LIST_APP_ID,
      title: i18n.translate('workspace.settings.workspaceList', {
        defaultMessage: 'See More',
      }),
      euiIconType: 'folderClosed',
      category: WORKSPACE_NAV_CATEGORY,
      navLinkStatus: workspaceId ? AppNavLinkStatus.hidden : AppNavLinkStatus.default,
      async mount(params: AppMountParameters) {
        const { renderListApp } = await import('./application');
        return mountWorkspaceApp(params, renderListApp);
      },
    });

    // workspace fatal error
    core.application.register({
      id: WORKSPACE_FATAL_ERROR_APP_ID,
      title: '',
      navLinkStatus: AppNavLinkStatus.hidden,
      async mount(params: AppMountParameters) {
        const { renderFatalErrorApp } = await import('./application');
        return mountWorkspaceApp(params, renderFatalErrorApp);
      },
    });

    return {};
  }

  private workspaceToChromeNavLink(
    workspace: WorkspaceAttribute,
    http: HttpSetup,
    application: ApplicationStart,
    index: number
  ): ChromeNavLink {
    const id = WORKSPACE_OVERVIEW_APP_ID + '/' + workspace.id;
    const url = formatUrlWithWorkspaceId(
      application.getUrlForApp(WORKSPACE_OVERVIEW_APP_ID, {
        absolute: true,
      }),
      workspace.id,
      http.basePath
    );
    return {
      id,
      url,
      order: index,
      hidden: false,
      disabled: false,
      baseUrl: url,
      href: url,
      category: WORKSPACE_NAV_CATEGORY,
      title: i18n.translate('core.ui.workspaceNavList.workspaceName', {
        defaultMessage: workspace.name,
      }),
      externalLink: true,
    };
  }

  private _changeSavedObjectCurrentWorkspace() {
    if (this.coreStart) {
      return this.coreStart.workspaces.currentWorkspaceId$.subscribe((currentWorkspaceId) => {
        if (currentWorkspaceId) {
          this.coreStart?.savedObjects.client.setCurrentWorkspace(currentWorkspaceId);
        }
      });
    }
  }

  private filterByWorkspace(
    workspace: WorkspaceAttribute | null | undefined,
    allNavLinks: ChromeNavLink[]
  ) {
    if (!workspace) return allNavLinks;
    const features = workspace.features ?? [];
    return allNavLinks.filter((item) => features.includes(item.id));
  }

  private filterNavLinks(core: CoreStart) {
    const navLinksService = core.chrome.navLinks;
    const chromeNavLinks$ = navLinksService.getNavLinks$();
    const workspaceList$ = core.workspaces.workspaceList$;
    const currentWorkspace$ = core.workspaces.currentWorkspace$;
    combineLatest([
      workspaceList$,
      chromeNavLinks$.pipe(map(this.changeCategoryNameByWorkspaceFeatureFlag)),
      currentWorkspace$,
    ]).subscribe(([workspaceList, chromeNavLinks, currentWorkspace]) => {
      const filteredNavLinks = new Map<string, ChromeNavLink>();
      chromeNavLinks = this.filterByWorkspace(currentWorkspace, chromeNavLinks);
      chromeNavLinks.forEach((chromeNavLink) => {
        filteredNavLinks.set(chromeNavLink.id, chromeNavLink);
      });
      if (!currentWorkspace) {
        workspaceList
          .filter((workspace, index) => index < 5)
          .map((workspace, index) =>
            this.workspaceToChromeNavLink(workspace, core.http, core.application, index)
          )
          .forEach((workspaceNavLink) =>
            filteredNavLinks.set(workspaceNavLink.id, workspaceNavLink)
          );
      }
      navLinksService.setFilteredNavLinks(filteredNavLinks);
    });
  }

  /**
   * The category "Opensearch Dashboards" needs to be renamed as "Library"
   * when workspace feature flag is on, we need to do it here and generate
   * a new item without polluting the original ChromeNavLink.
   */
  private changeCategoryNameByWorkspaceFeatureFlag(chromeLinks: ChromeNavLink[]): ChromeNavLink[] {
    return chromeLinks.map((item) => {
      if (item.category?.id === DEFAULT_APP_CATEGORIES.opensearchDashboards.id) {
        return {
          ...item,
          category: {
            ...item.category,
            label: i18n.translate('core.ui.libraryNavList.label', {
              defaultMessage: 'Library',
            }),
          },
        };
      }
      return item;
    });
  }

  public start(core: CoreStart) {
    this.coreStart = core;

    mountDropdownList({
      application: core.application,
      workspaces: core.workspaces,
      chrome: core.chrome,
      http: core.http,
    });
    this.currentWorkspaceSubscription = this._changeSavedObjectCurrentWorkspace();
    if (core) {
      this.filterNavLinks(core);
    }
    return {};
  }

  public stop() {
    this.currentWorkspaceSubscription?.unsubscribe();
  }
}
