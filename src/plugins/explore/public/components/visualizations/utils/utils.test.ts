/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  applyAxisStyling,
  getAxisByRole,
  generateColorBySchema,
  swapAxes,
  getSwappedAxisRole,
} from './utils';
import { AxisRole, Positions, ColorSchemas, VisFieldType, StandardAxes } from '../types';

describe('applyAxisStyling', () => {
  const defaultAxis = {
    id: 1,
    name: 'X Value',
    schema: VisFieldType.Numerical,
    column: 'x',
    validValuesCount: 6,
    uniqueValuesCount: 6,
  };

  const defaultAxisStyle = {
    id: 'Axis-1',
    position: Positions.LEFT,
    show: true,
    style: {},
    labels: {
      show: true,
      rotate: 45,
      filter: false,
      truncate: 10,
    },
    title: {
      text: 'Custom Title',
    },
    grid: {
      showLines: true,
    },
    axisRole: AxisRole.X,
  };

  it('returns default config with title and labels when style is provided', () => {
    const config = applyAxisStyling(defaultAxis, defaultAxisStyle);
    expect(config.grid).toBe(true);
    expect(config.orient).toBe(Positions.LEFT);
    expect(config.title).toBe('Custom Title');
    expect(config.labelAngle).toBe(45);
    expect(config.labelLimit).toBe(10);
    expect(config.labelOverlap).toBe('greedy');
  });

  it('disables axis when show is false', () => {
    const config = applyAxisStyling(defaultAxis, { ...defaultAxisStyle, show: false });
    expect(config.title).toBeNull();
    expect(config.labels).toBe(false);
    expect(config.ticks).toBe(false);
    expect(config.domain).toBe(false);
  });
});

describe('getAxisByRole', () => {
  it('returns the axis with specified role', () => {
    const axes = [{ axisRole: AxisRole.X }, { axisRole: AxisRole.Y }];
    expect(getAxisByRole(axes as any, AxisRole.X)?.axisRole).toBe(AxisRole.X);
  });

  it('returns undefined when no axis matches', () => {
    const axes = [{ axisRole: AxisRole.Y }];
    expect(getAxisByRole(axes as any, AxisRole.X)).toBeUndefined();
  });
});

describe('generateColorBySchema', () => {
  it('generates correct number of colors', () => {
    const colors = generateColorBySchema(3, ColorSchemas.BLUES);
    expect(colors).toHaveLength(3);
    expect(colors[0]).toMatch(/^#/);
  });

  it('returns empty array for unknown schema', () => {
    const colors = generateColorBySchema(3, 'UNKNOWN' as any);
    expect(colors).toEqual([]);
  });
});

describe('swapAxes', () => {
  it('correctly swaps X and Y axes and their positions', () => {
    const axes = [
      { axisRole: AxisRole.X, position: Positions.BOTTOM },
      { axisRole: AxisRole.Y, position: Positions.LEFT },
    ];

    const swapped = swapAxes(axes as any);
    expect(swapped[0].axisRole).toBe(AxisRole.Y);
    expect(swapped[0].position).toBe(Positions.LEFT);
    expect(swapped[1].axisRole).toBe(AxisRole.X);
    expect(swapped[1].position).toBe(Positions.BOTTOM);
  });
});

describe('getSwappedAxisRole', () => {
  it('returns undefined when axes are missing', () => {
    const { xAxis, yAxis } = getSwappedAxisRole({}, {});
    expect(xAxis).toBeUndefined();
    expect(yAxis).toBeUndefined();
  });

  it('returns swapped roles if switchAxes is true', () => {
    const { xAxis, yAxis } = getSwappedAxisRole(
      {
        standardAxes: [
          { axisRole: AxisRole.X, position: Positions.BOTTOM } as StandardAxes,
          { axisRole: AxisRole.Y, position: Positions.LEFT } as StandardAxes,
        ],
        switchAxes: true,
      },
      {
        x: {
          id: 1,
          name: 'X Value',
          schema: VisFieldType.Categorical,
          column: 'x',
          validValuesCount: 6,
          uniqueValuesCount: 6,
        },
        y: {
          id: 2,
          name: 'Y Value',
          schema: VisFieldType.Numerical,
          column: 'y',
          validValuesCount: 6,
          uniqueValuesCount: 6,
        },
      }
    );

    expect(xAxis?.schema).toBe(VisFieldType.Numerical);
    expect(yAxis?.schema).toBe(VisFieldType.Categorical);
  });
});
