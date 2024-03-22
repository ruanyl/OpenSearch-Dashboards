/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FormattedMessage } from '@osd/i18n/react';
import { groupBy } from 'lodash';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiComboBox,
  EuiFormRow,
  EuiCheckbox,
  EuiInMemoryTable,
  EuiToolTip,
  EuiIcon,
  EuiCallOut,
  EuiText,
  EuiTextColor,
} from '@elastic/eui';
import { HttpSetup, NotificationsStart, WorkspacesStart } from 'opensearch-dashboards/public';
import { i18n } from '@osd/i18n';
import { SavedObjectWithMetadata } from '../../../../common';
import { getSavedObjectLabel } from '../../../../public';
import {
  WorkspaceOption,
  capitalizeFirstLetter,
  getTargetWorkspacesOptions,
  workspaceToOption,
} from './utils';

export enum DuplicateMode {
  Selected = 'selected',
  All = 'all',
}
export interface ShowDuplicateModalProps {
  onDuplicate: (
    savedObjects: SavedObjectWithMetadata[],
    includeReferencesDeep: boolean,
    targetWorkspace: string
  ) => Promise<void>;
  http: HttpSetup;
  workspaces: WorkspacesStart;
  duplicateMode: DuplicateMode;
  notifications: NotificationsStart;
  selectedSavedObjects: SavedObjectWithMetadata[];
}

interface Props extends ShowDuplicateModalProps {
  onClose: () => void;
}

interface State {
  allSelectedObjects: SavedObjectWithMetadata[];
  workspaceOptions: WorkspaceOption[];
  targetWorkspaceOption: WorkspaceOption[];
  isLoading: boolean;
  isIncludeReferencesDeepChecked: boolean;
  savedObjectTypeInfoMap: Map<string, [number, boolean]>;
}

export class SavedObjectsDuplicateModal extends React.Component<Props, State> {
  private isMounted = false;

  constructor(props: Props) {
    super(props);

    const { workspaces, duplicateMode } = props;
    const currentWorkspace = workspaces.currentWorkspace$.value;
    const currentWorkspaceId = currentWorkspace?.id;
    const targetWorkspacesOptions = getTargetWorkspacesOptions(workspaces, currentWorkspaceId);

    // If user click 'Duplicate All' button, saved objects will be categoried by type.
    const savedObjectTypeInfoMap = new Map<string, [number, boolean]>();
    if (duplicateMode === DuplicateMode.All) {
      const categorizedObjects = groupBy(props.selectedSavedObjects, (object) => object.type);
      for (const [savedObjectType, savedObjects] of Object.entries(categorizedObjects)) {
        savedObjectTypeInfoMap.set(savedObjectType, [savedObjects.length, true]);
      }
    }

    this.state = {
      allSelectedObjects: props.selectedSavedObjects,
      // current workspace is the first option
      workspaceOptions: [
        ...(currentWorkspace ? [workspaceToOption(currentWorkspace, currentWorkspaceId)] : []),
        ...targetWorkspacesOptions,
      ],
      targetWorkspaceOption: [],
      isLoading: false,
      isIncludeReferencesDeepChecked: true,
      savedObjectTypeInfoMap,
    };
    this.isMounted = true;
  }

  componentWillUnmount() {
    this.isMounted = false;
  }

  duplicateSavedObjects = async (savedObjects: SavedObjectWithMetadata[]) => {
    this.setState({
      isLoading: true,
    });

    const targetWorkspace = this.state.targetWorkspaceOption[0].key;

    await this.props.onDuplicate(
      savedObjects,
      this.state.isIncludeReferencesDeepChecked,
      targetWorkspace!
    );

    if (this.isMounted) {
      this.setState({
        isLoading: false,
      });
    }
  };

  onTargetWorkspaceChange = (targetWorkspaceOption: WorkspaceOption[]) => {
    this.setState({
      targetWorkspaceOption,
    });
  };

  changeIncludeReferencesDeep = () => {
    this.setState((state) => ({
      isIncludeReferencesDeepChecked: !state.isIncludeReferencesDeepChecked,
    }));
  };

  // Choose whether to copy a certain type or not.
  changeIncludeSavedObjectType = (savedObjectType: string) => {
    const { savedObjectTypeInfoMap } = this.state;
    const savedObjectTypeInfo = savedObjectTypeInfoMap.get(savedObjectType);
    if (savedObjectTypeInfo) {
      const [count, checked] = savedObjectTypeInfo;
      savedObjectTypeInfoMap.set(savedObjectType, [count, !checked]);
      this.setState({ savedObjectTypeInfoMap });
    }
  };

  // A checkbox showing the type and count of save objects.
  renderDuplicateObjectCategory = (
    savedObjectType: string,
    savedObjectTypeCount: number,
    savedObjectTypeChecked: boolean
  ) => {
    return (
      <EuiCheckbox
        id={'includeSavedObjectType.' + savedObjectType}
        key={savedObjectType}
        label={
          <FormattedMessage
            id={
              'savedObjectsManagement.objectsTable.duplicateModal.savedObjectType.' +
              savedObjectType
            }
            defaultMessage={
              capitalizeFirstLetter(savedObjectType) + ` (${savedObjectTypeCount.toString()})`
            }
          />
        }
        checked={savedObjectTypeChecked}
        onChange={() => this.changeIncludeSavedObjectType(savedObjectType)}
      />
    );
  };

  renderDuplicateObjectCategories = () => {
    const { savedObjectTypeInfoMap } = this.state;
    const checkboxList: JSX.Element[] = [];
    savedObjectTypeInfoMap.forEach(
      ([savedObjectTypeCount, savedObjectTypeChecked], savedObjectType) =>
        checkboxList.push(
          this.renderDuplicateObjectCategory(
            savedObjectType,
            savedObjectTypeCount,
            savedObjectTypeChecked
          )
        )
    );
    return checkboxList;
  };

  isSavedObjectTypeIncluded = (savedObjectType: string) => {
    const { savedObjectTypeInfoMap } = this.state;
    const savedObjectTypeInfo = savedObjectTypeInfoMap.get(savedObjectType);
    return savedObjectTypeInfo && savedObjectTypeInfo[1];
  };

  render() {
    const {
      workspaceOptions,
      targetWorkspaceOption,
      isIncludeReferencesDeepChecked,
      allSelectedObjects,
    } = this.state;
    const { duplicateMode, onClose } = this.props;
    const targetWorkspaceId = targetWorkspaceOption?.at(0)?.key;
    let selectedObjects = allSelectedObjects;
    if (duplicateMode === DuplicateMode.All) {
      selectedObjects = selectedObjects.filter((item) => this.isSavedObjectTypeIncluded(item.type));
    }
    // If the target workspace is selected, all saved objects will be retained.
    // If the target workspace has been selected, filter out the saved objects that belongs to the workspace.
    const includedSelectedObjects = selectedObjects.filter((item) =>
      !!targetWorkspaceId && !!item.workspaces ? !item.workspaces.includes(targetWorkspaceId) : true
    );

    const ignoredSelectedObjectsLength = selectedObjects.length - includedSelectedObjects.length;

    let confirmDuplicateButtonEnabled = false;
    if (!!targetWorkspaceId && includedSelectedObjects.length > 0) {
      confirmDuplicateButtonEnabled = true;
    }

    const warningMessageForOnlyOneSavedObject = (
      <EuiText>
        <EuiTextColor color="danger">1</EuiTextColor> saved object will{' '}
        <EuiTextColor color="danger">not</EuiTextColor> be copied, because it has already existed in
        the selected workspace or it is worksapce itself.
      </EuiText>
    );
    const warningMessageForMultipleSavedObjects = (
      <EuiText>
        <EuiTextColor color="danger">{ignoredSelectedObjectsLength}</EuiTextColor> saved objects
        will <EuiTextColor color="danger">not</EuiTextColor> be copied, because they have already
        existed in selected workspace or they are workspaces themselves.
      </EuiText>
    );

    // Show the number and reason why some saved objects cannot be duplicated.
    const ignoreSomeObjectsChildren: React.ReactChild = (
      <>
        <EuiCallOut
          title="Some saved objects will be ignored."
          color="warning"
          iconType="help"
          aria-disabled={ignoredSelectedObjectsLength === 0}
        >
          {ignoredSelectedObjectsLength === 1
            ? warningMessageForOnlyOneSavedObject
            : warningMessageForMultipleSavedObjects}
        </EuiCallOut>
        <EuiSpacer />
      </>
    );

    return (
      <EuiModal
        data-test-subj="savedObjectsDuplicateModal"
        className="savedObjectsModal"
        onClose={onClose}
      >
        <EuiModalHeader>
          <EuiModalHeaderTitle>
            <FormattedMessage
              id="savedObjectsManagement.objectsTable.duplicateModal.title"
              defaultMessage="Duplicate {duplicateMode, select, all {all objects} other {{objectCount, plural, =1 {{objectName}} other {# objects}}}}?"
              values={{
                duplicateMode,
                objectName: allSelectedObjects[0].meta.title,
                objectCount: allSelectedObjects.length,
              }}
            />
          </EuiModalHeaderTitle>
        </EuiModalHeader>

        <EuiModalBody>
          <EuiFormRow
            fullWidth
            label={i18n.translate(
              'savedObjectsManagement.objectsTable.duplicateModal.targetWorkspacelabel',
              { defaultMessage: 'Destination workspace' }
            )}
          >
            <>
              <EuiText size="s" color="subdued">
                {'Specify a workspace where the objects will be duplicated.'}
              </EuiText>
              <EuiSpacer size="s" />
              <EuiComboBox
                options={workspaceOptions}
                onChange={this.onTargetWorkspaceChange}
                selectedOptions={targetWorkspaceOption}
                singleSelection={{ asPlainText: true }}
                isClearable={false}
                isInvalid={!confirmDuplicateButtonEnabled}
              />
            </>
          </EuiFormRow>

          <EuiSpacer size="m" />
          {duplicateMode === DuplicateMode.All && this.renderDuplicateObjectCategories()}
          {duplicateMode === DuplicateMode.All && <EuiSpacer size="m" />}

          <EuiFormRow
            fullWidth
            label={i18n.translate(
              'savedObjectsManagement.objectsTable.duplicateModal.relatedObjects',
              { defaultMessage: 'Related Objects' }
            )}
          >
            <>
              <EuiText size="s" color="subdued">
                {
                  'We recommended duplicating related objects to ensure your duplicated objects will continue to function.'
                }
              </EuiText>
              <EuiSpacer size="s" />
              <EuiCheckbox
                id={'includeReferencesDeep'}
                label={i18n.translate(
                  'savedObjectsManagement.objectsTable.duplicateModal.includeReferencesDeepLabel',
                  { defaultMessage: 'Duplicate related objects' }
                )}
                checked={isIncludeReferencesDeepChecked}
                onChange={this.changeIncludeReferencesDeep}
              />
            </>
          </EuiFormRow>

          <EuiSpacer size="m" />
          {ignoredSelectedObjectsLength === 0 ? null : ignoreSomeObjectsChildren}
          <p>
            <FormattedMessage
              id="savedObjectsManagement.objectsTable.duplicateModal.tableTitle"
              defaultMessage="The following saved objects will be copied:"
            />
          </p>
          <EuiSpacer size="m" />
          <EuiInMemoryTable
            items={includedSelectedObjects}
            columns={[
              {
                field: 'type',
                name: i18n.translate(
                  'savedObjectsManagement.objectsTable.duplicateModal.typeColumnName',
                  { defaultMessage: 'Type' }
                ),
                width: '50px',
                render: (type, object) => (
                  <EuiToolTip position="top" content={getSavedObjectLabel(type)}>
                    <EuiIcon type={object.meta?.icon || 'apps'} />
                  </EuiToolTip>
                ),
              },
              {
                field: 'id',
                name: i18n.translate(
                  'savedObjectsManagement.objectsTable.duplicateModal.idColumnName',
                  {
                    defaultMessage: 'Id',
                  }
                ),
              },
              {
                field: 'meta.title',
                name: i18n.translate(
                  'savedObjectsManagement.objectsTable.duplicateModal.titleColumnName',
                  { defaultMessage: 'Title' }
                ),
              },
            ]}
            pagination={true}
            sorting={false}
          />
        </EuiModalBody>

        <EuiModalFooter>
          <EuiButtonEmpty data-test-subj="duplicateCancelButton" onClick={this.props.onClose}>
            <FormattedMessage
              id="savedObjectsManagement.objectsTable.duplicateModal.duplicateCancelButton"
              defaultMessage="Cancel"
            />
          </EuiButtonEmpty>

          <EuiButton
            fill
            data-test-subj="duplicateConfirmButton"
            onClick={() => this.duplicateSavedObjects(includedSelectedObjects)}
            isLoading={this.state.isLoading}
            disabled={!confirmDuplicateButtonEnabled}
          >
            <FormattedMessage
              id="savedObjectsManagement.objectsTable.duplicateModal.confirmButtonLabel"
              defaultMessage="Duplicate{duplicateMode, select, all {({objectCount})} other {}}"
              values={{
                duplicateMode,
                objectCount: includedSelectedObjects.length,
              }}
            />
          </EuiButton>
        </EuiModalFooter>
      </EuiModal>
    );
  }
}
