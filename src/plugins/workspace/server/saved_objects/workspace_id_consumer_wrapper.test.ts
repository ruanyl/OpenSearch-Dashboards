/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { updateWorkspaceState } from '../../../../core/server/utils';
import { SavedObject } from '../../../../core/public';
import { httpServerMock, savedObjectsClientMock, coreMock } from '../../../../core/server/mocks';
import { WorkspaceIdConsumerWrapper } from './workspace_id_consumer_wrapper';
import { DATA_SOURCE_SAVED_OBJECT_TYPE } from '../../../../plugins/data_source/common';

describe('WorkspaceIdConsumerWrapper', () => {
  const requestHandlerContext = coreMock.createRequestHandlerContext();
  const wrapperInstance = new WorkspaceIdConsumerWrapper();
  const mockedClient = savedObjectsClientMock.create();
  const workspaceEnabledMockRequest = httpServerMock.createOpenSearchDashboardsRequest();
  updateWorkspaceState(workspaceEnabledMockRequest, {
    requestWorkspaceId: 'foo',
  });
  const wrapperClient = wrapperInstance.wrapperFactory({
    client: mockedClient,
    typeRegistry: requestHandlerContext.savedObjects.typeRegistry,
    request: workspaceEnabledMockRequest,
  });
  const getSavedObject = (savedObject: Partial<SavedObject>) => {
    const payload: SavedObject = {
      references: [],
      id: '',
      type: 'dashboard',
      attributes: {},
      ...savedObject,
    };

    return payload;
  };
  describe('create', () => {
    beforeEach(() => {
      mockedClient.create.mockClear();
    });
    it(`Should add workspaces parameters when create`, async () => {
      await wrapperClient.create('dashboard', {
        name: 'foo',
      });

      expect(mockedClient.create).toBeCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          workspaces: ['foo'],
        })
      );
    });

    it(`Should not use options.workspaces when there is no workspaces inside options`, async () => {
      await wrapperClient.create(
        'dashboard',
        {
          name: 'foo',
        },
        {
          id: 'dashboard:foo',
          overwrite: true,
          workspaces: null,
        }
      );

      expect(mockedClient.create.mock.calls[0][2]?.hasOwnProperty('workspaces')).toEqual(false);
    });

    it(`Should throw error when trying to create disallowed type in workspace`, async () => {
      expect(() =>
        wrapperClient.create(
          DATA_SOURCE_SAVED_OBJECT_TYPE,
          {
            name: 'foo',
          },

          {
            workspaces: ['foo'],
          }
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"Unsupport type in workspace: 'data-source' is not allowed to create in workspace."`
      );

      expect(() =>
        wrapperClient.create(
          'config',
          {
            name: 'foo',
          },

          {
            workspaces: ['foo'],
          }
        )
      ).toThrowErrorMatchingInlineSnapshot(
        `"Unsupport type in workspace: 'config' is not allowed to create in workspace."`
      );
    });
  });

  describe('bulkCreate', () => {
    beforeEach(() => {
      mockedClient.bulkCreate.mockClear();
    });
    it(`Should add workspaces parameters when bulk create`, async () => {
      await wrapperClient.bulkCreate([
        getSavedObject({
          id: 'foo',
        }),
      ]);

      expect(mockedClient.bulkCreate).toBeCalledWith(
        [{ attributes: {}, id: 'foo', references: [], type: 'dashboard' }],
        {
          workspaces: ['foo'],
        }
      );
    });

    it(`Should return error when trying to create unallowed type within a workspace`, async () => {
      mockedClient.bulkCreate.mockResolvedValueOnce({ saved_objects: [] });
      const result = await wrapperClient.bulkCreate([
        getSavedObject({
          type: 'config',
          id: 'foo',
        }),
        getSavedObject({
          type: DATA_SOURCE_SAVED_OBJECT_TYPE,
          id: 'foo',
        }),
      ]);

      expect(mockedClient.bulkCreate).toBeCalledWith([], {
        workspaces: ['foo'],
      });
      expect(result.saved_objects[0].error).toEqual(
        expect.objectContaining({
          message: "Unsupport type in workspace: 'config' is not allowed to import in workspace.",
          statusCode: 400,
        })
      );
      expect(result.saved_objects[1].error).toEqual(
        expect.objectContaining({
          message:
            "Unsupport type in workspace: 'data-source' is not allowed to import in workspace.",
          statusCode: 400,
        })
      );
    });
  });

  describe('checkConflict', () => {
    beforeEach(() => {
      mockedClient.checkConflicts.mockClear();
    });

    it(`Should add workspaces parameters when checkConflict`, async () => {
      await wrapperClient.checkConflicts();
      expect(mockedClient.checkConflicts).toBeCalledWith([], {
        workspaces: ['foo'],
      });
    });
  });

  describe('find', () => {
    beforeEach(() => {
      mockedClient.find.mockClear();
    });

    it(`Should add workspaces parameters when find`, async () => {
      await wrapperClient.find({
        type: 'dashboard',
      });
      expect(mockedClient.find).toBeCalledWith({
        type: 'dashboard',
        workspaces: ['foo'],
      });
    });

    it(`workspaces parameters should be removed when finding data sources`, async () => {
      await wrapperClient.find({
        type: DATA_SOURCE_SAVED_OBJECT_TYPE,
        workspaces: ['foo'],
      });
      expect(mockedClient.find).toBeCalledWith({
        type: DATA_SOURCE_SAVED_OBJECT_TYPE,
      });
    });
  });
});
