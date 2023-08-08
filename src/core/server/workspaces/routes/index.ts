/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { schema } from '@osd/config-schema';

import { PermissionMode } from '../../../utils/constants';
import { ACL, Permissions } from '../../saved_objects/permission_control/acl';
import { InternalHttpServiceSetup } from '../../http';
import { Logger } from '../../logging';
import { IWorkspaceDBImpl, WorkspaceRoutePermissionItem } from '../types';

const WORKSPACES_API_BASE_URL = '/api/workspaces';

const workspacePermissionMode = schema.oneOf([
  schema.literal(PermissionMode.LibraryRead),
  schema.literal(PermissionMode.LibraryWrite),
  schema.literal(PermissionMode.Management),
]);

const workspacePermission = schema.oneOf([
  schema.object({
    type: schema.literal('user'),
    userId: schema.string(),
    modes: schema.arrayOf(workspacePermissionMode),
  }),
  schema.object({
    type: schema.literal('group'),
    group: schema.string(),
    modes: schema.arrayOf(workspacePermissionMode),
  }),
]);

const workspaceAttributesSchema = schema.object({
  description: schema.maybe(schema.string()),
  name: schema.string(),
  features: schema.maybe(schema.arrayOf(schema.string())),
  color: schema.maybe(schema.string()),
  icon: schema.maybe(schema.string()),
  defaultVISTheme: schema.maybe(schema.string()),
  permissions: schema.oneOf([workspacePermission, schema.arrayOf(workspacePermission)]),
});

const convertToACL = (
  workspacePermissions: WorkspaceRoutePermissionItem | WorkspaceRoutePermissionItem[]
) => {
  workspacePermissions = Array.isArray(workspacePermissions)
    ? workspacePermissions
    : [workspacePermissions];

  const acl = new ACL();

  workspacePermissions.forEach((permission) => {
    switch (permission.type) {
      case 'user':
        acl.addPermission(permission.modes, { users: [permission.userId] });
        return;
      case 'group':
        acl.addPermission(permission.modes, { groups: [permission.group] });
        return;
    }
  });

  return acl.getPermissions() || {};
};

const convertFromACL = (permissions: Permissions) => {
  const acl = new ACL(permissions);

  return acl.transformPermissions().map(({ name, permissions: modes, type }) => ({
    type: type === 'users' ? 'user' : 'group',
    modes,
    ...{ [type === 'users' ? 'userId' : 'group']: name },
  }));
};

export function registerRoutes({
  client,
  logger,
  http,
}: {
  client: IWorkspaceDBImpl;
  logger: Logger;
  http: InternalHttpServiceSetup;
}) {
  const router = http.createRouter(WORKSPACES_API_BASE_URL);
  router.post(
    {
      path: '/_list',
      validate: {
        body: schema.object({
          search: schema.maybe(schema.string()),
          sortOrder: schema.maybe(schema.string()),
          perPage: schema.number({ min: 0, defaultValue: 20 }),
          page: schema.number({ min: 0, defaultValue: 1 }),
          sortField: schema.maybe(schema.string()),
          searchFields: schema.maybe(schema.arrayOf(schema.string())),
        }),
      },
    },
    router.handleLegacyErrors(async (context, req, res) => {
      const result = await client.list(
        {
          context,
          request: req,
          logger,
        },
        req.body
      );
      if (!result.success) {
        return res.ok({ body: result });
      }
      return res.ok({
        body: {
          ...result,
          result: {
            ...result.result,
            workspaces: result.result.workspaces.map((workspace) => ({
              ...workspace,
              permissions: convertFromACL(workspace.permissions),
            })),
          },
        },
      });
    })
  );
  router.get(
    {
      path: '/{id}',
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
    },
    router.handleLegacyErrors(async (context, req, res) => {
      const { id } = req.params;
      const result = await client.get(
        {
          context,
          request: req,
          logger,
        },
        id
      );
      if (!result.success) {
        return res.ok({ body: result });
      }

      return res.ok({
        body: {
          ...result,
          result: {
            ...result.result,
            permissions: convertFromACL(result.result.permissions),
          },
        },
      });
    })
  );
  router.post(
    {
      path: '',
      validate: {
        body: schema.object({
          attributes: workspaceAttributesSchema,
        }),
      },
    },
    router.handleLegacyErrors(async (context, req, res) => {
      const { attributes } = req.body;

      const result = await client.create(
        {
          context,
          request: req,
          logger,
        },
        {
          ...attributes,
          permissions: convertToACL(attributes.permissions),
        }
      );
      return res.ok({ body: result });
    })
  );
  router.put(
    {
      path: '/{id?}',
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
        body: schema.object({
          attributes: workspaceAttributesSchema,
        }),
      },
    },
    router.handleLegacyErrors(async (context, req, res) => {
      const { id } = req.params;
      const { attributes } = req.body;

      const result = await client.update(
        {
          context,
          request: req,
          logger,
        },
        id,
        {
          ...attributes,
          permissions: convertToACL(attributes.permissions),
        }
      );
      return res.ok({ body: result });
    })
  );
  router.delete(
    {
      path: '/{id?}',
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
    },
    router.handleLegacyErrors(async (context, req, res) => {
      const { id } = req.params;

      const result = await client.delete(
        {
          context,
          request: req,
          logger,
        },
        id
      );
      return res.ok({ body: result });
    })
  );
}
