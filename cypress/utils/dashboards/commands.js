/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

Cypress.Commands.add('selectFromDataSourceSelector', (dataSourceTitle, dataSourceId) => {
  // clean up the input field
  cy.wait(1000);
  cy.getElementByTestId('dataSourceSelectorComboBox').find('input').type(`{selectall}{backspace}`);
  cy.waitForLoader();
  cy.getElementByTestId('dataSourceSelectorComboBox').should('have.attr', 'aria-expanded', 'false');
  cy.getElementByTestId('dataSourceSelectorComboBox')
    .find(`button[data-test-subj="comboBoxToggleListButton"]`)
    .then(($element) => {
      if ($element.attr('aria-label') === 'Open list of options') {
        $element.click();
      }
    });
  cy.getElementByTestId('dataSourceSelectorComboBox').should('have.attr', 'aria-expanded', 'true');
  if (dataSourceId) {
    cy.get(`#${dataSourceId}`).should('be.visible').trigger('click');
  } else if (dataSourceTitle) {
    cy.get(`.euiFilterSelectItem[title="${dataSourceTitle}"]`)
      .should('be.visible')
      .trigger('click');
  }
  cy.waitForLoader();
});

Cypress.Commands.add(
  'selectFromDataSourceSelectorFromStandardPageHeader',
  (dataSourceTitle, dataSourceId) => {
    // clean up the input field
    cy.wait(1000);
    cy.getElementByTestId('dataSourceSelectableButton').click();
    cy.getElementByTestId('dataSourceSelectable').find('input').type(`{selectall}{backspace}`);
    cy.waitForLoader();
    if (dataSourceId) {
      cy.get(`#${dataSourceId}`).should('be.visible').trigger('click');
    } else if (dataSourceTitle) {
      cy.get(`.euiSelectableListItem[title="${dataSourceTitle}"]`)
        .should('be.visible')
        .trigger('click');
    }
    cy.waitForLoader();
  }
);

Cypress.Commands.add(
  // navigates to the workspace HomePage of a given workspace
  'navigateToWorkSpaceHomePage',
  (url, workspaceName) => {
    // Selecting the correct workspace
    cy.visit(`${url}/app/workspace_list#`);
    cy.openWorkspaceDashboard(workspaceName);
  }
);

Cypress.Commands.add(
  //navigate to workspace specific pages
  'navigateToWorkSpaceSpecificPage',
  (opts) => {
    const { url, workspaceName, page, isEnhancement = false } = opts;

    // Navigating to the WorkSpace Home Page
    cy.navigateToWorkSpaceHomePage(url, workspaceName);

    // Opening the side panel
    cy.getElementByTestId('toggleNavButton')
      .should('be.visible')
      .then((ele) => {
        if (ele.length > 0) {
          ele.first().click();
        }
      });

    cy.getElementByTestId(`collapsibleNavAppLink-${page}`).should('be.visible').click();

    // wait until page loads and close side panel
    cy.waitForLoader(isEnhancement);

    // close the nav menu
    if (isEnhancement) {
      cy.getElementByTestId('collapsibleNavShrinkButton').should('be.visible').click();
    }
  }
);

Cypress.Commands.add(
  // creates an index pattern within the workspace
  // Don't use * in the indexPattern it adds it by default at the end of name
  'createWorkspaceIndexPatterns',
  (opts) => {
    const {
      url,
      workspaceName,
      indexPattern,
      timefieldName,
      indexPatternHasTimefield = true,
      dataSource,
      isEnhancement = false,
    } = opts;

    // Navigate to Workspace Specific IndexPattern Page
    cy.navigateToWorkSpaceSpecificPage({
      url,
      workspaceName,
      page: 'indexPatterns',
      isEnhancement,
    });
    cy.getElementByTestId('createIndexPatternButton').click();

    if (dataSource) {
      cy.get('[type="data-source"]').contains(dataSource).click();
    }

    cy.getElementByTestId('createIndexPatternStepDataSourceNextStepButton').click();

    cy.getElementByTestId('createIndexPatternNameInput')
      .should('be.visible')
      .clear()
      .type(indexPattern);
    cy.getElementByTestId('createIndexPatternGoToStep2Button').click();

    // wait for the select input if it exists
    if (indexPatternHasTimefield || timefieldName) {
      cy.getElementByTestId('createIndexPatternTimeFieldSelect').should('be.visible');
    }

    if (indexPatternHasTimefield && !!timefieldName) {
      cy.getElementByTestId('createIndexPatternTimeFieldSelect').select(timefieldName);
    } else if (indexPatternHasTimefield && !timefieldName) {
      cy.getElementByTestId('createIndexPatternTimeFieldSelect').select(
        "I don't want to use the time filter"
      );
    }

    cy.getElementByTestId('createIndexPatternButton').should('be.visible').click();
    cy.getElementByTestId('headerApplicationTitle').contains(indexPattern);
  }
);

Cypress.Commands.add(
  // deletes an index pattern within the workspace
  // Don't use * in the indexPattern it adds it by default at the end of name
  'deleteWorkspaceIndexPatterns',
  (opts) => {
    const { url, workspaceName, indexPattern, isEnhancement = false } = opts;

    // Navigate to Workspace Specific IndexPattern Page
    cy.navigateToWorkSpaceSpecificPage({
      url,
      workspaceName,
      page: 'indexPatterns',
      isEnhancement,
    });

    cy.contains('a', indexPattern).click();
    cy.getElementByTestId('deleteIndexPatternButton').should('be.visible').click();
    cy.getElementByTestId('confirmModalConfirmButton').should('be.visible').click();

    // wait until delete is done
    cy.getElementByTestId('headerApplicationTitle').should('be.visible');
  }
);
