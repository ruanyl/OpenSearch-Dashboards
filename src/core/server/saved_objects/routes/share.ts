/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { IRouter } from '../../http';
import { exportSavedObjectsToStream } from '../export';
import { validateObjects } from './utils';
import { collectSavedObjects } from '../import/collect_saved_objects';
import { WORKSPACE_TYPE } from '../../workspaces';

const SHARE_LIMIT = 10000;

export const registerShareRoute = (router: IRouter) => {
  router.post(
    {
      path: '/_share',
      validate: {
        body: schema.object({
          sourceWorkspaceId: schema.maybe(schema.string()),
          objects: schema.arrayOf(
            schema.object({
              id: schema.string(),
              type: schema.string(),
            })
          ),
          targetWorkspaceIds: schema.arrayOf(schema.string()),
        }),
      },
    },
    router.handleLegacyErrors(async (context, req, res) => {
      const savedObjectsClient = context.core.savedObjects.client;
      const { sourceWorkspaceId, objects, targetWorkspaceIds } = req.body;

      // need to access the registry for type validation, can't use the schema for this
      const supportedTypes = context.core.savedObjects.typeRegistry
        .getAllTypes()
        .filter((type) => type.name !== WORKSPACE_TYPE)
        .map((t) => t.name);

      if (objects) {
        const validationError = validateObjects(objects, supportedTypes);
        if (validationError) {
          return res.badRequest({
            body: {
              message: validationError,
            },
          });
        }
      }

      const objectsListStream = await exportSavedObjectsToStream({
        savedObjectsClient,
        objects,
        exportSizeLimit: SHARE_LIMIT,
        includeReferencesDeep: true,
        excludeExportDetails: true,
      });

      const collectSavedObjectsResult = await collectSavedObjects({
        readStream: objectsListStream,
        objectLimit: SHARE_LIMIT,
        supportedTypes,
      });

      const savedObjects = collectSavedObjectsResult.collectedObjects;

      if (sourceWorkspaceId) {
        const invalidObjects = savedObjects.filter((obj) => {
          // TODO non-public workspace
          if (obj.workspaces && obj.workspaces.length > 0) {
            return !obj.workspaces.includes(sourceWorkspaceId);
          }
          return false;
        });
        if (invalidObjects && invalidObjects.length > 0) {
          return res.badRequest({
            body: {
              message: `Saved objects are not belong to current workspace: ${invalidObjects
                .map((obj) => `${obj.type}:${obj.id}`)
                .join(', ')}`,
            },
          });
        }
      }

      const sharedObjects = savedObjects
        // non-public
        .filter((obj) => obj.workspaces && obj.workspaces.length > 0)
        .map((obj) => ({ id: obj.id, type: obj.type }));

      const response = await savedObjectsClient.addToWorkspaces(sharedObjects, targetWorkspaceIds);

      return res.ok({
        body: response,
      });
    })
  );
};
