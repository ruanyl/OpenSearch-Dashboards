/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState, FormEventHandler, useRef, useMemo, useEffect } from 'react';
import { groupBy } from 'lodash';
import {
  EuiBottomBar,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiForm,
  EuiFormRow,
  EuiFieldText,
  EuiSelect,
  EuiText,
  EuiButton,
  EuiButtonEmpty,
  EuiFlexItem,
  htmlIdGenerator,
  EuiCheckbox,
  EuiCheckboxGroup,
  EuiCheckboxGroupProps,
  EuiCheckboxProps,
  EuiFieldTextProps,
  EuiColorPicker,
  EuiColorPickerProps,
  EuiHorizontalRule,
  EuiFlexGroup,
  EuiPageHeader,
  EuiConfirmModal,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  App,
  AppNavLinkStatus,
  ApplicationStart,
  DEFAULT_APP_CATEGORIES,
  MANAGEMENT_WORKSPACE_ID,
} from '../../../../../core/public';
import { useApplications } from '../../hooks';
import {
  WORKSPACE_OP_TYPE_CREATE,
  WORKSPACE_OP_TYPE_UPDATE,
  DEFAULT_CHECKED_FEATURES_IDS, WORKSPACE_LIST_APP_ID,
} from '../../../common/constants';
import {
  isFeatureDependBySelectedFeatures,
  getFinalFeatureIdsByDependency,
  generateFeatureDependencyMap,
} from '../utils/feature';

import { WorkspaceIconSelector } from './workspace_icon_selector';
import {
  WorkspacePermissionSetting,
  WorkspacePermissionSettingPanel,
} from './workspace_permission_setting_panel';
import { featureMatchesConfig } from '../../utils';

interface WorkspaceFeature extends Pick<App, 'dependencies'> {
  id: string;
  name: string;
}

interface WorkspaceFeatureGroup {
  name: string;
  features: WorkspaceFeature[];
}

export interface WorkspaceFormSubmitData {
  name: string;
  description?: string;
  features?: string[];
  color?: string;
  icon?: string;
  defaultVISTheme?: string;
  permissions: WorkspacePermissionSetting[];
}

export interface WorkspaceFormData extends WorkspaceFormSubmitData {
  id: string;
  reserved?: boolean;
}

type WorkspaceFormErrors = Omit<{ [key in keyof WorkspaceFormData]?: string }, 'permissions'> & {
  permissions?: string[];
};

const isWorkspaceFeatureGroup = (
  featureOrGroup: WorkspaceFeature | WorkspaceFeatureGroup
): featureOrGroup is WorkspaceFeatureGroup => 'features' in featureOrGroup;

const isValidWorkspacePermissionSetting = (
  setting: Partial<WorkspacePermissionSetting>
): setting is WorkspacePermissionSetting =>
  !!setting.modes &&
  setting.modes.length > 0 &&
  ((setting.type === 'user' && !!setting.userId) || (setting.type === 'group' && !!setting.group));

const isDefaultCheckedFeatureId = (id: string) => {
  return DEFAULT_CHECKED_FEATURES_IDS.indexOf(id) > -1;
};

const appendDefaultFeatureIds = (ids: string[]) => {
  // concat default checked ids and unique the result
  return Array.from(new Set(ids.concat(DEFAULT_CHECKED_FEATURES_IDS)));
};

const workspaceHtmlIdGenerator = htmlIdGenerator();

const defaultVISThemeOptions = [{ value: 'categorical', text: 'Categorical' }];

interface WorkspaceFormProps {
  application: ApplicationStart;
  onSubmit?: (formData: WorkspaceFormSubmitData) => void;
  defaultValues?: WorkspaceFormData;
  opType?: string;
  permissionFirstRowDeletable?: boolean;
  permissionEnabled?: boolean;
}

export const WorkspaceForm = ({
  application,
  onSubmit,
  defaultValues,
  opType,
  permissionFirstRowDeletable,
  permissionEnabled,
}: WorkspaceFormProps) => {
  const applications = useApplications(application);
  const workspaceNameReadOnly = defaultValues?.reserved;
  const [name, setName] = useState(defaultValues?.name);
  const [description, setDescription] = useState(defaultValues?.description);
  const [color, setColor] = useState(defaultValues?.color);
  const [icon, setIcon] = useState(defaultValues?.icon);
  const [defaultVISTheme, setDefaultVISTheme] = useState(defaultValues?.defaultVISTheme);
  const isEditingManagementWorkspace = defaultValues?.id === MANAGEMENT_WORKSPACE_ID;
  const [tabFeatureSelected, setTabFeatureSelected] = useState(!isEditingManagementWorkspace);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);

  // The matched feature id list based on original feature config,
  // the feature category will be expanded to list of feature ids
  const defaultFeatures = useMemo(() => {
    // The original feature list, may contain feature id and category wildcard like @management, etc.
    const defaultOriginalFeatures = defaultValues?.features ?? [];
    return applications.filter(featureMatchesConfig(defaultOriginalFeatures)).map((app) => app.id);
  }, [defaultValues?.features, applications]);

  const defaultFeaturesRef = useRef(defaultFeatures);
  defaultFeaturesRef.current = defaultFeatures;

  useEffect(() => {
    // When applications changed, reset form feature selection to original value
    setSelectedFeatureIds(appendDefaultFeatureIds(defaultFeaturesRef.current));
  }, [applications]);

  const [selectedFeatureIds, setSelectedFeatureIds] = useState(
    appendDefaultFeatureIds(defaultFeatures)
  );
  const [permissionSettings, setPermissionSettings] = useState<
    Array<Partial<WorkspacePermissionSetting>>
  >(
    defaultValues?.permissions && defaultValues.permissions.length > 0
      ? defaultValues.permissions
      : []
  );

  const [formErrors, setFormErrors] = useState<WorkspaceFormErrors>({});
  const formIdRef = useRef<string>();
  const getFormData = () => ({
    name,
    description,
    features: selectedFeatureIds,
    color,
    icon,
    defaultVISTheme,
    permissions: permissionSettings,
  });
  const getFormDataRef = useRef(getFormData);
  getFormDataRef.current = getFormData;

  const featureOrGroups = useMemo(() => {
    const transformedApplications = applications.map((app) => {
      if (app.category?.id === DEFAULT_APP_CATEGORIES.opensearchDashboards.id) {
        return {
          ...app,
          category: {
            ...app.category,
            label: i18n.translate('core.ui.libraryNavList.label', {
              defaultMessage: 'Library',
            }),
          },
        };
      }
      return app;
    });
    const category2Applications = groupBy(transformedApplications, 'category.label');
    return Object.keys(category2Applications).reduce<
      Array<WorkspaceFeature | WorkspaceFeatureGroup>
    >((previousValue, currentKey) => {
      const apps = category2Applications[currentKey];
      const features = apps
        .filter(
          ({ navLinkStatus, chromeless, category }) =>
            navLinkStatus !== AppNavLinkStatus.hidden &&
            !chromeless &&
            category?.id !== DEFAULT_APP_CATEGORIES.management.id
        )
        .map(({ id, title, dependencies }) => ({
          id,
          name: title,
          dependencies,
        }));
      if (features.length === 0) {
        return previousValue;
      }
      if (currentKey === 'undefined') {
        return [...previousValue, ...features];
      }
      return [
        ...previousValue,
        {
          name: apps[0].category?.label || '',
          features,
        },
      ];
    }, []);
  }, [applications]);

  const allFeatures = useMemo(
    () =>
      featureOrGroups.reduce<WorkspaceFeature[]>(
        (previousData, currentData) => [
          ...previousData,
          ...(isWorkspaceFeatureGroup(currentData) ? currentData.features : [currentData]),
        ],
        []
      ),
    [featureOrGroups]
  );

  const featureDependencies = useMemo(() => generateFeatureDependencyMap(allFeatures), [
    allFeatures,
  ]);

  if (!formIdRef.current) {
    formIdRef.current = workspaceHtmlIdGenerator();
  }

  const handleFeatureChange = useCallback<EuiCheckboxGroupProps['onChange']>(
    (featureId) => {
      setSelectedFeatureIds((previousData) => {
        if (!previousData.includes(featureId)) {
          return getFinalFeatureIdsByDependency([featureId], featureDependencies, previousData);
        }

        if (isFeatureDependBySelectedFeatures(featureId, previousData, featureDependencies)) {
          return previousData;
        }

        return previousData.filter((selectedId) => selectedId !== featureId);
      });
    },
    [featureDependencies]
  );

  const handleFeatureCheckboxChange = useCallback<EuiCheckboxProps['onChange']>(
    (e) => {
      handleFeatureChange(e.target.id);
    },
    [handleFeatureChange]
  );

  const handleFeatureGroupChange = useCallback<EuiCheckboxProps['onChange']>(
    (e) => {
      for (const featureOrGroup of featureOrGroups) {
        if (isWorkspaceFeatureGroup(featureOrGroup) && featureOrGroup.name === e.target.id) {
          const groupFeatureIds = featureOrGroup.features.map((feature) => feature.id);
          setSelectedFeatureIds((previousData) => {
            const notExistsIds = groupFeatureIds.filter((id) => !previousData.includes(id));
            if (notExistsIds.length > 0) {
              return getFinalFeatureIdsByDependency(
                notExistsIds,
                featureDependencies,
                previousData
              );
            }
            let groupRemainFeatureIds = groupFeatureIds;
            const outGroupFeatureIds = previousData.filter(
              (featureId) => !groupFeatureIds.includes(featureId)
            );

            while (true) {
              const lastRemainFeatures = groupRemainFeatureIds.length;
              groupRemainFeatureIds = groupRemainFeatureIds.filter((featureId) =>
                isFeatureDependBySelectedFeatures(
                  featureId,
                  [...outGroupFeatureIds, ...groupRemainFeatureIds],
                  featureDependencies
                )
              );
              if (lastRemainFeatures === groupRemainFeatureIds.length) {
                break;
              }
            }

            return [...outGroupFeatureIds, ...groupRemainFeatureIds];
          });
        }
      }
    },
    [featureOrGroups, featureDependencies]
  );

  const handleFormSubmit = useCallback<FormEventHandler>(
    (e) => {
      e.preventDefault();
      const formData = getFormDataRef.current();
      if (!formData.name) {
        setFormErrors({
          name: i18n.translate('workspace.form.name.empty', {
            defaultMessage: "Name can't be empty.",
          }),
        });
        return;
      }
      const permissionErrors: string[] = new Array(formData.permissions.length);
      for (let i = 0; i < formData.permissions.length; i++) {
        const permission = formData.permissions[i];
        if (isValidWorkspacePermissionSetting(permission)) {
          continue;
        }
        if (!permission.type) {
          permissionErrors[i] = i18n.translate('workspace.form.permission.invalidate.type', {
            defaultMessage: 'Invalid type',
          });
          continue;
        }
        if (!permission.modes || permission.modes.length === 0) {
          permissionErrors[i] = i18n.translate('workspace.form.permission.invalidate.modes', {
            defaultMessage: 'Invalid permission modes',
          });
          continue;
        }
        if (permission.type === 'user' && !permission.userId) {
          permissionErrors[i] = i18n.translate('workspace.form.permission.invalidate.userId', {
            defaultMessage: 'Invalid userId',
          });
          continue;
        }
        if (permission.type === 'group' && !permission.group) {
          permissionErrors[i] = i18n.translate('workspace.form.permission.invalidate.group', {
            defaultMessage: 'Invalid user group',
          });
          continue; // this line is need for more conditions
        }
      }
      if (permissionErrors.some((error) => !!error)) {
        setFormErrors({ permissions: permissionErrors });
        return;
      }

      const featureConfigChanged =
        formData.features.length !== defaultFeatures.length ||
        formData.features.some((feat) => !defaultFeatures.includes(feat));

      if (!featureConfigChanged) {
        // If feature config not changed, set workspace feature config to the original value.
        // The reason why we do this is when a workspace feature is configured by wildcard,
        // such as `['@management']` or `['*']`. The form value `formData.features` will be
        // expanded to array of individual feature id, if the feature hasn't changed, we will
        // set the feature config back to the original value so that category wildcard won't
        // expanded to feature ids
        formData.features = defaultValues?.features ?? [];
      }

      const permissions = formData.permissions.filter(isValidWorkspacePermissionSetting);
      setFormErrors({});
      onSubmit?.({ ...formData, name: formData.name, permissions });
    },
    [onSubmit, defaultFeatures, defaultValues?.features]
  );

  const handleNameInputChange = useCallback<Required<EuiFieldTextProps>['onChange']>((e) => {
    setName(e.target.value);
  }, []);

  const handleDescriptionInputChange = useCallback<Required<EuiFieldTextProps>['onChange']>((e) => {
    setDescription(e.target.value);
  }, []);

  const handleColorChange = useCallback<Required<EuiColorPickerProps>['onChange']>((text) => {
    setColor(text);
  }, []);

  const handleIconChange = useCallback((newIcon: string) => {
    setIcon(newIcon);
  }, []);

  const handleTabFeatureClick = useCallback(() => {
    setTabFeatureSelected(true);
  }, []);

  const handleTabPermissionClick = useCallback(() => {
    setTabFeatureSelected(false);
  }, []);

  const onDefaultVISThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDefaultVISTheme(e.target.value);
  };

  const closeCancelModal = () => setIsCancelModalVisible(false);
  const showCancelModal = () => setIsCancelModalVisible(true);

  const cancelModal = (
    <EuiConfirmModal
      title={i18n.translate('workspace.form.cancelModal.title', {
        defaultMessage: 'Discard changes?',
      })}
      onCancel={closeCancelModal}
      onConfirm={() => application?.navigateToApp(WORKSPACE_LIST_APP_ID)}
      cancelButtonText={i18n.translate('workspace.form.cancelButtonText.', {
        defaultMessage: 'Continue editing',
      })}
      confirmButtonText={i18n.translate('workspace.form.confirmButtonText.', {
        defaultMessage: 'Discard changes',
      })}
      buttonColor="danger"
      defaultFocusedButton="confirm"
    >
      {i18n.translate('workspace.form.cancelModal.body', {
        defaultMessage: 'This will discard all changes. Are you sure?',
      })}
    </EuiConfirmModal>
  );

  // Number of saved changes will be implemented in workspace update page PR
  const bottomBar = (
    <div>
      <EuiSpacer size="xl" />
      <EuiSpacer size="xl" />
      <EuiBottomBar>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s">
              {opType === WORKSPACE_OP_TYPE_UPDATE && (
                <EuiText textAlign="left">
                  {i18n.translate('workspace.form.bottomBar.unsavedChanges', {
                    defaultMessage: '1 Unsaved change(s)',
                  })}
                </EuiText>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="m">
              <EuiText textAlign="right">
                <EuiButtonEmpty color="ghost" onClick={showCancelModal}>
                  {i18n.translate('workspace.form.bottomBar.cancel', {
                    defaultMessage: 'Cancel',
                  })}
                </EuiButtonEmpty>
              </EuiText>
              <EuiSpacer />
              <EuiText textAlign="right">
                {opType === WORKSPACE_OP_TYPE_CREATE && (
                  <EuiButton form={formIdRef.current} type="submit" fill color="primary">
                    {i18n.translate('workspace.form.bottomBar.createWorkspace', {
                      defaultMessage: 'Create workspace',
                    })}
                  </EuiButton>
                )}
                {opType === WORKSPACE_OP_TYPE_UPDATE && (
                  <EuiButton form={formIdRef.current} type="submit" fill color="primary">
                    {i18n.translate('workspace.form.bottomBar.saveChanges', {
                      defaultMessage: 'Save changes',
                    })}
                  </EuiButton>
                )}
              </EuiText>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiBottomBar>
    </div>
  );

  const workspaceDetailsTitle = i18n.translate('workspace.form.workspaceDetails.title', {
    defaultMessage: 'Workspace Details',
  });
  const featureVisibilityTitle = i18n.translate('workspace.form.featureVisibility.title', {
    defaultMessage: 'Feature Visibility',
  });
  const usersAndPermissionsTitle = i18n.translate('workspace.form.usersAndPermissions.title', {
    defaultMessage: 'Users & Permissions',
  });
  const libraryCategoryId = i18n.translate('core.ui.libraryNavList.label', {
    defaultMessage: 'Library',
  });
  const categoryToDescription: { [key: string]: string } = {
    [libraryCategoryId]: i18n.translate(
      'workspace.form.featureVisibility.libraryCategory.Description',
      {
        defaultMessage: 'Workspace-owned library items',
      }
    ),
  };

  return (
    <EuiForm id={formIdRef.current} onSubmit={handleFormSubmit} component="form">
      <EuiPanel>
        <EuiTitle size="s">
          <h2>{workspaceDetailsTitle}</h2>
        </EuiTitle>
        <EuiHorizontalRule margin="xs" />
        <EuiSpacer size="s" />
        <EuiFormRow
          label={i18n.translate('workspace.form.workspaceDetails.name.label', {
            defaultMessage: 'Name',
          })}
          helpText={i18n.translate('workspace.form.workspaceDetails.name.helpText', {
            defaultMessage:
              'Valid characters are a-z, A-Z, 0-9, (), [], _ (underscore), - (hyphen) and (space).',
          })}
          isInvalid={!!formErrors.name}
          error={formErrors.name}
        >
          <EuiFieldText
            value={name}
            onChange={handleNameInputChange}
            readOnly={workspaceNameReadOnly}
          />
        </EuiFormRow>
        <EuiFormRow
          label={
            <>
              Description - <i>optional</i>
            </>
          }
          helpText={i18n.translate('workspace.form.workspaceDetails.description.helpText', {
            defaultMessage:
              'Valid characters are a-z, A-Z, 0-9, (), [], _ (underscore), - (hyphen) and (space).',
          })}
        >
          <EuiFieldText value={description} onChange={handleDescriptionInputChange} />
        </EuiFormRow>
        <EuiFormRow
          label={i18n.translate('workspace.form.workspaceDetails.color.label', {
            defaultMessage: 'Color',
          })}
          isInvalid={!!formErrors.color}
          error={formErrors.color}
        >
          <div>
            <EuiText size="xs" color="subdued">
              {i18n.translate('workspace.form.workspaceDetails.color.helpText', {
                defaultMessage: 'Accent color for your workspace',
              })}
            </EuiText>
            <EuiSpacer size={'s'} />
            <EuiColorPicker color={color} onChange={handleColorChange} />
          </div>
        </EuiFormRow>
        <EuiFormRow
          label={i18n.translate('workspace.form.workspaceDetails.icon.label', {
            defaultMessage: 'Icon',
          })}
          isInvalid={!!formErrors.icon}
          error={formErrors.icon}
        >
          <WorkspaceIconSelector value={icon} onChange={handleIconChange} color={color} />
        </EuiFormRow>
        <EuiFormRow
          label={i18n.translate('workspace.form.workspaceDetails.defaultVisualizationTheme.label', {
            defaultMessage: 'Default visualization theme',
          })}
          isInvalid={!!formErrors.defaultVISTheme}
          error={formErrors.defaultVISTheme}
        >
          <EuiSelect
            hasNoInitialSelection
            value={defaultVISTheme}
            options={defaultVISThemeOptions}
            onChange={onDefaultVISThemeChange}
          />
        </EuiFormRow>
      </EuiPanel>
      <EuiSpacer />
      <EuiPageHeader
        tabs={[
          ...(isEditingManagementWorkspace
            ? []
            : [
                {
                  label: featureVisibilityTitle,
                  isSelected: tabFeatureSelected,
                  onClick: handleTabFeatureClick,
                },
              ]),
          {
            label: usersAndPermissionsTitle,
            isSelected: !tabFeatureSelected,
            onClick: handleTabPermissionClick,
          },
        ]}
      />

      {tabFeatureSelected && (
        <EuiPanel>
          <EuiTitle size="s">
            <h2>{featureVisibilityTitle}</h2>
          </EuiTitle>
          <EuiHorizontalRule margin="xs" />
          <EuiSpacer size="s" />
          {featureOrGroups.map((featureOrGroup) => {
            const features = isWorkspaceFeatureGroup(featureOrGroup) ? featureOrGroup.features : [];
            const selectedIds = selectedFeatureIds.filter((id) =>
              (isWorkspaceFeatureGroup(featureOrGroup)
                ? featureOrGroup.features
                : [featureOrGroup]
              ).find((item) => item.id === id)
            );
            return (
              <EuiFlexGroup key={featureOrGroup.name}>
                <EuiFlexItem key={featureOrGroup.name + '-1'}>
                  <div>
                    <EuiText>
                      <strong>{featureOrGroup.name}</strong>
                    </EuiText>
                    {isWorkspaceFeatureGroup(featureOrGroup) && (
                      <EuiText>{categoryToDescription[featureOrGroup.name] ?? ''}</EuiText>
                    )}
                  </div>
                </EuiFlexItem>
                <EuiFlexItem key={featureOrGroup.name + '-2'}>
                  <EuiCheckbox
                    id={
                      isWorkspaceFeatureGroup(featureOrGroup)
                        ? featureOrGroup.name
                        : featureOrGroup.id
                    }
                    onChange={
                      isWorkspaceFeatureGroup(featureOrGroup)
                        ? handleFeatureGroupChange
                        : handleFeatureCheckboxChange
                    }
                    label={`${featureOrGroup.name}${
                      features.length > 0 ? `(${selectedIds.length}/${features.length})` : ''
                    }`}
                    checked={selectedIds.length > 0}
                    disabled={
                      !isWorkspaceFeatureGroup(featureOrGroup) &&
                      isDefaultCheckedFeatureId(featureOrGroup.id)
                    }
                    indeterminate={
                      isWorkspaceFeatureGroup(featureOrGroup) &&
                      selectedIds.length > 0 &&
                      selectedIds.length < features.length
                    }
                  />
                  {isWorkspaceFeatureGroup(featureOrGroup) && (
                    <EuiCheckboxGroup
                      options={featureOrGroup.features.map((item) => ({
                        id: item.id,
                        label: item.name,
                        disabled: isDefaultCheckedFeatureId(item.id),
                      }))}
                      idToSelectedMap={selectedIds.reduce(
                        (previousValue, currentValue) => ({
                          ...previousValue,
                          [currentValue]: true,
                        }),
                        {}
                      )}
                      onChange={handleFeatureChange}
                      style={{ marginLeft: 40 }}
                    />
                  )}
                </EuiFlexItem>
              </EuiFlexGroup>
            );
          })}
        </EuiPanel>
      )}

      {!tabFeatureSelected && (
        <EuiPanel>
          <EuiTitle size="s">
            <h2>{usersAndPermissionsTitle}</h2>
          </EuiTitle>
          <EuiHorizontalRule margin="xs" />
          <WorkspacePermissionSettingPanel
            errors={formErrors.permissions}
            value={permissionSettings}
            onChange={setPermissionSettings}
            firstRowDeletable={permissionFirstRowDeletable}
          />
        </EuiPanel>
      )}
      <EuiSpacer />
      {permissionEnabled && (
        <EuiPanel>
          <EuiTitle size="s">
            <h2>Members & permissions</h2>
          </EuiTitle>
          <WorkspacePermissionSettingPanel
            errors={formErrors.permissions}
            value={permissionSettings}
            onChange={setPermissionSettings}
            firstRowDeletable={permissionFirstRowDeletable}
          />
        </EuiPanel>
      )}
      {bottomBar}
      {isCancelModalVisible && cancelModal}
    </EuiForm>
  );
};
