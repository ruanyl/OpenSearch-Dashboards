/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState, FormEventHandler, useRef, useMemo, useEffect } from 'react';
import { groupBy } from 'lodash';
import {
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiForm,
  EuiFormRow,
  EuiFieldText,
  EuiSelect,
  EuiText,
  EuiFlexItem,
  EuiFlexGrid,
  htmlIdGenerator,
  EuiCheckbox,
  EuiCheckboxGroup,
  EuiCheckboxGroupProps,
  EuiCheckboxProps,
  EuiFieldTextProps,
  EuiColorPicker,
  EuiColorPickerProps,
  EuiFlexGroup,
  EuiTab,
  EuiTabs,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  AppNavLinkStatus,
  ApplicationStart,
  DEFAULT_APP_CATEGORIES,
  MANAGEMENT_WORKSPACE_ID,
} from '../../../../../core/public';
import { useApplications } from '../../hooks';
import {
  DEFAULT_CHECKED_FEATURES_IDS,
  WORKSPACE_OP_TYPE_CREATE,
  WORKSPACE_OP_TYPE_UPDATE,
} from '../../../common/constants';
import {
  isFeatureDependBySelectedFeatures,
  getFinalFeatureIdsByDependency,
  generateFeatureDependencyMap,
} from '../utils/feature';
import { WorkspaceBottomBar } from './workspace_bottom_bar';
import { WorkspaceIconSelector } from './workspace_icon_selector';
import { WorkspacePermissionSettingPanel } from './workspace_permission_setting_panel';
import { featureMatchesConfig } from '../../utils';
import {
  formatPermissions,
  getErrorsCount,
  getPermissionErrors,
  getUnsavedChangesCount,
  getUserAndGroupPermissions,
} from './utils';
import {
  WorkspaceFeature,
  WorkspaceFeatureGroup,
  WorkspaceFormData,
  WorkspaceFormErrors,
  WorkspaceFormSubmitData,
  PermissionFieldData,
  PermissionEditingData,
} from './types';

enum WorkspaceFormTabs {
  NotSelected,
  WorkspaceSettings,
  FeatureVisibility,
  UsersAndPermissions,
}

const isWorkspaceFeatureGroup = (
  featureOrGroup: WorkspaceFeature | WorkspaceFeatureGroup
): featureOrGroup is WorkspaceFeatureGroup => 'features' in featureOrGroup;

const isDefaultCheckedFeatureId = (id: string) => {
  return DEFAULT_CHECKED_FEATURES_IDS.indexOf(id) > -1;
};

const appendDefaultFeatureIds = (ids: string[]) => {
  // concat default checked ids and unique the result
  return Array.from(new Set(ids.concat(DEFAULT_CHECKED_FEATURES_IDS)));
};

const isValidNameOrDescription = (input?: string) => {
  if (!input) {
    return true;
  }
  const regex = /^[0-9a-zA-Z()_\[\]\-\s]+$/;
  return regex.test(input);
};

const workspaceHtmlIdGenerator = htmlIdGenerator();

const defaultVISThemeOptions = [{ value: 'categorical', text: 'Categorical' }];

interface WorkspaceFormProps {
  application: ApplicationStart;
  onSubmit?: (formData: WorkspaceFormSubmitData) => void;
  defaultValues?: WorkspaceFormData;
  opType?: string;
  permissionEnabled?: boolean;
  permissionLastAdminItemDeletable?: boolean;
}

export const WorkspaceForm = ({
  application,
  onSubmit,
  defaultValues,
  opType,
  permissionEnabled,
  permissionLastAdminItemDeletable,
}: WorkspaceFormProps) => {
  const applications = useApplications(application);
  const workspaceNameReadOnly = defaultValues?.reserved;
  const [name, setName] = useState(defaultValues?.name);
  const [description, setDescription] = useState(defaultValues?.description);
  const [color, setColor] = useState(defaultValues?.color);
  const [icon, setIcon] = useState(defaultValues?.icon);
  const [defaultVISTheme, setDefaultVISTheme] = useState(defaultValues?.defaultVISTheme);
  const isEditingManagementWorkspace = defaultValues?.id === MANAGEMENT_WORKSPACE_ID;

  // feature visibility section will be hidden in management workspace
  // permission section will be hidden when permission is not enabled
  const [selectedTab, setSelectedTab] = useState(
    !isEditingManagementWorkspace
      ? WorkspaceFormTabs.FeatureVisibility
      : permissionEnabled
      ? WorkspaceFormTabs.UsersAndPermissions
      : WorkspaceFormTabs.NotSelected
  );
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
  const [initialUserPermissions, initialGroupPermissions] = getUserAndGroupPermissions(
    defaultValues?.permissions && defaultValues.permissions.length > 0
      ? defaultValues.permissions
      : []
  );
  const [userPermissions, setUserPermissions] = useState<PermissionEditingData>(
    initialUserPermissions
  );
  const [groupPermissions, setGroupPermissions] = useState<PermissionEditingData>(
    initialGroupPermissions
  );

  const libraryCategoryLabel = i18n.translate('core.ui.libraryNavList.label', {
    defaultMessage: 'Library',
  });
  const categoryToDescription: { [key: string]: string } = {
    [libraryCategoryLabel]: i18n.translate(
      'workspace.form.featureVisibility.libraryCategory.Description',
      {
        defaultMessage: 'Workspace-owned library items',
      }
    ),
  };

  const [formErrors, setFormErrors] = useState<WorkspaceFormErrors>({});
  const errorsCount = useMemo(() => getErrorsCount(formErrors), [formErrors]);
  const formIdRef = useRef<string>();
  const getFormData = () => ({
    name,
    description,
    features: selectedFeatureIds,
    color,
    icon,
    defaultVISTheme,
    userPermissions,
    groupPermissions,
  });
  const getFormDataRef = useRef(getFormData);
  getFormDataRef.current = getFormData;

  const unsavedChangesCount = useMemo(() => {
    const currentFormData = {
      name,
      description,
      features: selectedFeatureIds,
      color,
      icon,
      defaultVISTheme,
      userPermissions,
      groupPermissions,
    };
    return getUnsavedChangesCount(defaultValues ?? ({} as any), currentFormData);
  }, [
    name,
    description,
    selectedFeatureIds,
    color,
    icon,
    defaultVISTheme,
    userPermissions,
    groupPermissions,
    defaultValues,
  ]);

  const featureOrGroups = useMemo(() => {
    const transformedApplications = applications.map((app) => {
      if (app.category?.id === DEFAULT_APP_CATEGORIES.opensearchDashboards.id) {
        return {
          ...app,
          category: {
            ...app.category,
            label: libraryCategoryLabel,
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
  }, [applications, libraryCategoryLabel]);

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
      let currentFormErrors: WorkspaceFormErrors = {};
      const formData = getFormDataRef.current();
      if (!formData.name) {
        currentFormErrors = {
          ...currentFormErrors,
          name: i18n.translate('workspace.form.detail.name.empty', {
            defaultMessage: "Name can't be empty.",
          }),
        };
      }
      if (!isValidNameOrDescription(formData.name)) {
        currentFormErrors = {
          ...currentFormErrors,
          name: i18n.translate('workspace.form.detail.name.invalid', {
            defaultMessage: 'Invalid workspace name',
          }),
        };
      }
      if (!isValidNameOrDescription(formData.description)) {
        currentFormErrors = {
          ...currentFormErrors,
          description: i18n.translate('workspace.form.detail.description.invalid', {
            defaultMessage: 'Invalid workspace description',
          }),
        };
      }
      const userPermissionErrors = getPermissionErrors(formData.userPermissions);
      const groupPermissionErrors = getPermissionErrors(formData.groupPermissions);
      if (userPermissionErrors.some((error) => !!error)) {
        currentFormErrors = {
          ...currentFormErrors,
          userPermissions: userPermissionErrors,
        };
      }
      if (groupPermissionErrors.some((error) => !!error)) {
        currentFormErrors = {
          ...currentFormErrors,
          groupPermissions: groupPermissionErrors,
        };
      }
      const currentErrorsCount = getErrorsCount(currentFormErrors);
      setFormErrors(currentFormErrors);
      if (currentErrorsCount > 0) {
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
        // be expanded to feature ids
        formData.features = defaultValues?.features ?? [];
      }

      // Create a new object without the specified properties
      // If there are no form errors, attributes are available in TypelessPermissionSetting
      const {
        ['userPermissions']: formDataUserPermissions,
        ['groupPermissions']: formDataGroupPermissions,
        ...formDataWithoutPermissions
      } = formData;
      onSubmit?.({
        ...formDataWithoutPermissions,
        name: formData.name!,
        permissions: formatPermissions(
          formDataUserPermissions as PermissionFieldData[],
          formDataGroupPermissions as PermissionFieldData[]
        ),
      });
    },
    [defaultFeatures, onSubmit, defaultValues?.features]
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
    setSelectedTab(WorkspaceFormTabs.FeatureVisibility);
  }, []);

  const handleTabPermissionClick = useCallback(() => {
    setSelectedTab(WorkspaceFormTabs.UsersAndPermissions);
  }, []);

  const handleTabWorkspaceSettingsClick = useCallback(() => {
    setSelectedTab(WorkspaceFormTabs.WorkspaceSettings);
  }, []);

  const onDefaultVISThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDefaultVISTheme(e.target.value);
  };

  const workspaceOverviewTitle = i18n.translate('workspace.form.overview.title', {
    defaultMessage: 'Overview',
  });
  const workspaceDetailsTitle = i18n.translate('workspace.form.workspaceDetails.title', {
    defaultMessage: 'Workspace Details',
  });
  const featureVisibilityTitle = i18n.translate('workspace.form.featureVisibility.title', {
    defaultMessage: 'Feature Visibility',
  });
  const workspaceSettingsTitle = i18n.translate('workspace.form.workspaceSettings.title', {
    defaultMessage: 'Workspace Settings',
  });
  const usersAndPermissionsTitle = i18n.translate('workspace.form.usersAndPermissions.title', {
    defaultMessage: 'Users & Permissions',
  });

  const workspaceOverviewSection = (
    <EuiPanel>
      <EuiTitle size="s">
        <h2>{workspaceOverviewTitle}</h2>
      </EuiTitle>
      <EuiSpacer size="m" />
      <EuiFlexGrid columns={3}>
        <EuiFlexItem>
          <>
            <EuiText>
              <strong>
                {i18n.translate('workspace.form.overview.workspaceNameTitle', {
                  defaultMessage: 'Name',
                })}
              </strong>
            </EuiText>
            <EuiText>{defaultValues?.name}</EuiText>
          </>
        </EuiFlexItem>
        <EuiFlexItem>
          <>
            <EuiText>
              <strong>
                {i18n.translate('workspace.form.overview.lastUpdatedTimeTitle', {
                  defaultMessage: 'Last Updated',
                })}
              </strong>
            </EuiText>
            <EuiText>{defaultValues?.name}</EuiText>
          </>
        </EuiFlexItem>
        <EuiFlexItem>
          <>
            <EuiText>
              <strong>
                {i18n.translate('workspace.form.overview.createdTimeTitle', {
                  defaultMessage: 'Created',
                })}
              </strong>
            </EuiText>
            <EuiText>{defaultValues?.name}</EuiText>
          </>
        </EuiFlexItem>
        <EuiFlexItem>
          <>
            <EuiText>
              <strong>
                {i18n.translate('workspace.form.overview.workspaceDescriptionTitle', {
                  defaultMessage: 'Workspace Description',
                })}
              </strong>
            </EuiText>
            <EuiText>{defaultValues?.description}</EuiText>
          </>
        </EuiFlexItem>
      </EuiFlexGrid>
    </EuiPanel>
  );

  const workspaceInfoSection = (
    <EuiPanel>
      <EuiTitle size="s">
        <h2>
          {opType === WORKSPACE_OP_TYPE_UPDATE ? workspaceSettingsTitle : workspaceDetailsTitle}
        </h2>
      </EuiTitle>
      <EuiSpacer size="m" />
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
          data-test-subj="workspaceForm-workspaceDetails-nameInputText"
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
        isInvalid={!!formErrors.description}
        error={formErrors.description}
      >
        <EuiFieldText
          value={description}
          onChange={handleDescriptionInputChange}
          data-test-subj="workspaceForm-workspaceDetails-descriptionInputText"
        />
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
          <EuiColorPicker
            color={color}
            onChange={handleColorChange}
            data-test-subj="workspaceForm-workspaceDetails-colorPicker"
          />
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
          data-test-subj="workspaceForm-workspaceDetails-defaultVISThemeSelector"
        />
      </EuiFormRow>
    </EuiPanel>
  );

  return (
    <EuiForm id={formIdRef.current} onSubmit={handleFormSubmit} component="form">
      {opType === WORKSPACE_OP_TYPE_UPDATE && workspaceOverviewSection}
      {opType === WORKSPACE_OP_TYPE_CREATE && workspaceInfoSection}
      <EuiSpacer />
      <EuiTabs>
        {!isEditingManagementWorkspace && (
          <EuiTab
            onClick={handleTabFeatureClick}
            isSelected={selectedTab === WorkspaceFormTabs.FeatureVisibility}
            data-test-subj="workspaceForm-tabSelection-featureVisibility"
          >
            <EuiText>{featureVisibilityTitle}</EuiText>
          </EuiTab>
        )}
        {opType === WORKSPACE_OP_TYPE_UPDATE && (
          <EuiTab
            onClick={handleTabWorkspaceSettingsClick}
            isSelected={selectedTab === WorkspaceFormTabs.WorkspaceSettings}
            data-test-subj="workspaceForm-tabSelection-workspaceSettings"
          >
            <EuiText>{workspaceSettingsTitle}</EuiText>
          </EuiTab>
        )}
        {permissionEnabled && (
          <EuiTab
            onClick={handleTabPermissionClick}
            isSelected={selectedTab === WorkspaceFormTabs.UsersAndPermissions}
            data-test-subj="workspaceForm-tabSelection-usersAndPermissions"
          >
            <EuiText>{usersAndPermissionsTitle}</EuiText>
          </EuiTab>
        )}
      </EuiTabs>

      {opType === WORKSPACE_OP_TYPE_UPDATE &&
        selectedTab === WorkspaceFormTabs.WorkspaceSettings &&
        workspaceInfoSection}

      {selectedTab === WorkspaceFormTabs.FeatureVisibility && (
        <EuiPanel>
          <EuiTitle size="s">
            <h2>{featureVisibilityTitle}</h2>
          </EuiTitle>
          <EuiSpacer size="m" />
          {featureOrGroups.map((featureOrGroup) => {
            const features = isWorkspaceFeatureGroup(featureOrGroup) ? featureOrGroup.features : [];
            const selectedIds = selectedFeatureIds.filter((id) =>
              (isWorkspaceFeatureGroup(featureOrGroup)
                ? featureOrGroup.features
                : [featureOrGroup]
              ).find((item) => item.id === id)
            );
            const featureOrGroupId = isWorkspaceFeatureGroup(featureOrGroup)
              ? featureOrGroup.name
              : featureOrGroup.id;
            return (
              <EuiFlexGroup key={featureOrGroup.name}>
                <EuiFlexItem>
                  <div>
                    <EuiText>
                      <strong>{featureOrGroup.name}</strong>
                    </EuiText>
                    {isWorkspaceFeatureGroup(featureOrGroup) && (
                      <EuiText>{categoryToDescription[featureOrGroup.name] ?? ''}</EuiText>
                    )}
                  </div>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiCheckbox
                    id={featureOrGroupId}
                    onChange={
                      isWorkspaceFeatureGroup(featureOrGroup)
                        ? handleFeatureGroupChange
                        : handleFeatureCheckboxChange
                    }
                    label={`${featureOrGroup.name}${
                      features.length > 0 ? ` (${selectedIds.length}/${features.length})` : ''
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
                    data-test-subj={`workspaceForm-workspaceFeatureVisibility-${featureOrGroupId}`}
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
                      data-test-subj={`workspaceForm-workspaceFeatureVisibility-featureWithCategory-${featureOrGroupId}`}
                    />
                  )}
                </EuiFlexItem>
              </EuiFlexGroup>
            );
          })}
        </EuiPanel>
      )}

      {selectedTab === WorkspaceFormTabs.UsersAndPermissions && (
        <EuiPanel>
          <EuiTitle size="s">
            <h2>{usersAndPermissionsTitle}</h2>
          </EuiTitle>
          <EuiSpacer size="s" />
          <WorkspacePermissionSettingPanel
            userErrors={formErrors.userPermissions}
            groupErrors={formErrors.groupPermissions}
            userPermissionSettings={userPermissions}
            groupPermissionSettings={groupPermissions}
            onUserPermissionChange={setUserPermissions}
            onGroupPermissionChange={setGroupPermissions}
            lastAdminItemDeletable={!!permissionLastAdminItemDeletable}
            data-test-subj={`workspaceForm-permissionSettingPanel`}
          />
        </EuiPanel>
      )}
      <EuiSpacer />
      <WorkspaceBottomBar
        opType={opType}
        formId={formIdRef.current}
        application={application}
        errorsCount={errorsCount}
        unsavedChangesCount={unsavedChangesCount}
      />
    </EuiForm>
  );
};
