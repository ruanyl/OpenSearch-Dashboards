/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { EuiIconType } from '@elastic/eui/src/components/icon/icon';
import { pick } from '@osd/std';
import { AppCategory } from '../../';

/**
 * @public
 */
export interface ChromeNavLink {
  /**
   * A unique identifier for looking up links.
   */
  readonly id: string;

  /**
   * The title of the application.
   */
  readonly title: string;

  /**
   * The category the app lives in
   */
  readonly category?: AppCategory;

  /**
   * The base route used to open the root of an application.
   */
  readonly baseUrl: string;

  /**
   * The route used to open the {@link AppBase.defaultPath | default path } of an application.
   * If unset, `baseUrl` will be used instead.
   */
  readonly url?: string;

  /**
   * An ordinal used to sort nav links relative to one another for display.
   */
  readonly order?: number;

  /**
   * A tooltip shown when hovering over an app link.
   */
  readonly tooltip?: string;

  /**
   * A EUI iconType that will be used for the app's icon. This icon
   * takes precedence over the `icon` property.
   */
  readonly euiIconType?: EuiIconType;

  /**
   * A URL to an image file used as an icon. Used as a fallback
   * if `euiIconType` is not provided.
   */
  readonly icon?: string;

  /**
   * Settled state between `url`, `baseUrl`, and `active`
   */
  readonly href: string;

  /**
   * Disables a link from being clickable.
   *
   * @internalRemarks
   * This is used by the ML and Graph plugins. They use this field
   * to disable the nav link when the license is expired.
   * This is also used by recently visited category in left menu
   * to disable "No recently visited items".
   */
  readonly disabled?: boolean;

  /**
   * Hides a link from the navigation.
   */
  readonly hidden?: boolean;

  /**
   * Links can be navigated through url.
   */
  readonly externalLink?: boolean;
}

/** @public */
export type ChromeNavLinkUpdateableFields = Partial<
  Pick<ChromeNavLink, 'disabled' | 'hidden' | 'url' | 'href'>
>;

export class NavLinkWrapper {
  public readonly id: string;
  public readonly properties: Readonly<ChromeNavLink>;

  constructor(properties: ChromeNavLink) {
    if (!properties || !properties.id) {
      throw new Error('`id` is required.');
    }

    this.id = properties.id;
    this.properties = Object.freeze(properties);
  }

  public update(newProps: ChromeNavLinkUpdateableFields) {
    // Enforce limited properties at runtime for JS code
    newProps = pick(newProps, ['disabled', 'hidden', 'url', 'href']);
    return new NavLinkWrapper({ ...this.properties, ...newProps });
  }
}
