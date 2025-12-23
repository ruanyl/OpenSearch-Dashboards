/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AggregationType, TimeUnit } from '../types';
import { inferTimeIntervals } from '../bar/bar_chart_utils';

const aggregateValues = (aggregationType: AggregationType, values?: number[]) => {
  if (!values || values.length === 0) return null;

  switch (aggregationType) {
    case AggregationType.SUM:
      return values.reduce((a, b) => a + b, 0);
    case AggregationType.MEAN:
      return values.reduce((a, b) => a + b, 0) / values.length;
    case AggregationType.MAX:
      return Math.max(...values);
    case AggregationType.MIN:
      return Math.min(...values);
    case AggregationType.COUNT:
      return values.length;
    case AggregationType.NONE:
    default:
      return values[0];
  }
};

/**
 * Helper function to aggregate data for ECharts
 * Returns 2D array with header row for use with ECharts dataset
 *
 * @param data - Raw data array
 * @param groupBy - Field name for categories (e.g., 'product', 'region')
 * @param field - Field name for values (e.g., 'sales', 'count')
 * @param aggregationType - Type of aggregation to apply (SUM, MEAN, MAX, MIN, COUNT, NONE)
 *
 * @returns 2D array with header row
 *
 * @example
 * Input data:
 * [
 *   { product: 'A', sales: 100 },
 *   { product: 'A', sales: 150 },
 *   { product: 'B', sales: 200 }
 * ]
 *
 * Output (with SUM aggregation):
 * [
 *   ['product', 'sales'],  // Header row
 *   ['A', 250],            // Aggregated: 100 + 150
 *   ['B', 200]
 * ]
 */

export const aggregate = (
  data: Array<Record<string, any>>,
  groupByMe: string,
  field: string,
  aggregationType: AggregationType,
  colorColumn?: string | undefined
): {
  aggregatedData: Array<Array<string | number | null>>;
  categorical2Collection?: string[] | undefined;
} => {
  if (!colorColumn) {
    const grouped = data.reduce((acc, row) => {
      const category = String(row[groupByMe]);
      if (!acc[category]) {
        acc[category] = [];
      }
      const value = Number(row[field]);
      if (!isNaN(value)) {
        acc[category].push(value);
      }
      return acc;
    }, {} as Record<string, number[]>);

    const aggregatedRes = Object.entries(grouped).map(([category, rows]) => {
      return [category, aggregateValues(aggregationType, rows) ?? null];
    });

    return {
      aggregatedData: [[groupByMe, field], ...aggregatedRes],
    };
  } else {
    // pivot data if there is a color column
    /**
     * @example
     * Input data:
     * [
     *   { product: 'A', sales: 100, type: 'cloth'},
     *   { product: 'A', sales: 150, type: 'food' },
     *   { product: 'B', sales: 200, type: 'food' }
     * ]
     *
     * Output:
     * [
     *   ['product', "cloth", "food"],  // Header row
     *   ['A', 100, 150],
     *   ['B', 200, null]
     * ] */
    const categorical2Collection = Array.from(new Set(data.map((item) => item[colorColumn])));
    const grouped = data.reduce((acc, row) => {
      const group = String(row[groupByMe]);
      const color = String(row[colorColumn]);
      const value = Number(row[field]);

      if (isNaN(value)) return acc;

      acc[group] ??= {};
      acc[group][color] ??= [];
      acc[group][color].push(value);

      return acc;
    }, {} as Record<string, Record<string, number[]>>);

    const aggregatedRes = Object.entries(grouped).map(([group, colorValues]) => {
      return [
        group,
        ...categorical2Collection.map(
          (color) => aggregateValues(aggregationType, colorValues[color]) ?? null
        ),
      ];
    });

    return {
      aggregatedData: [
        [groupByMe, ...categorical2Collection.map((c) => String(c))],
        ...aggregatedRes,
      ],
      categorical2Collection,
    };
  }
};

/**
 * Round timestamp to time unit bucket
 * @param timestamp - Date object to round
 * @param unit - TimeUnit to round to
 * @returns Date object rounded to the start of the time bucket
 */
const roundToTimeUnit = (timestamp: Date, unit: TimeUnit): Date => {
  const d = new Date(timestamp);
  switch (unit) {
    case TimeUnit.YEAR:
      return new Date(d.getFullYear(), 0, 1);
    case TimeUnit.MONTH:
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case TimeUnit.DATE:
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    case TimeUnit.HOUR:
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
    case TimeUnit.MINUTE:
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
    case TimeUnit.SECOND:
      return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        d.getHours(),
        d.getMinutes(),
        d.getSeconds()
      );
    default:
      return d;
  }
};

/**
 * Aggregate data by time intervals for ECharts
 * Returns 2D array with header row, using Date objects as time bucket keys
 *
 * @param data - Raw data array
 * @param timeField - Field name for time/date values (ISO 8601 format)
 * @param valueField - Field name for numerical values to aggregate
 * @param timeUnit - Time interval unit (YEAR, MONTH, DATE, HOUR, MINUTE, SECOND, AUTO)
 * @param aggregationType - Type of aggregation to apply (SUM, MEAN, MAX, MIN, COUNT, NONE)
 *
 * @returns 2D array with header row, time buckets as Date objects
 *
 * @example
 * Input data:
 * [
 *   { timestamp: '2024-01-15T10:30:00Z', sales: 100 },
 *   { timestamp: '2024-01-15T14:20:00Z', sales: 150 },
 *   { timestamp: '2024-01-16T09:00:00Z', sales: 200 }
 * ]
 *
 * Output (with TimeUnit.DATE and SUM aggregation):
 * [
 *   ['timestamp', 'sales'],              // Header row
 *   [new Date('2024-01-15T00:00:00Z'), 250],  // 100 + 150
 *   [new Date('2024-01-16T00:00:00Z'), 200]
 * ]
 */
export const aggregateByTime = (
  data: Array<Record<string, any>>,
  timeField: string,
  valueField: string,
  timeUnit: TimeUnit,
  aggregationType: AggregationType,
  colorColumn?: string | undefined
): {
  aggregatedData: Array<Array<string | number | null>>;
  categorical2Collection?: string[] | undefined;
} => {
  // Infer time unit if AUTO
  const effectiveTimeUnit =
    timeUnit === TimeUnit.AUTO ? inferTimeIntervals(data, timeField) : timeUnit;

  if (!colorColumn) {
    // Group by time bucket
    const grouped = data.reduce((acc, row) => {
      const timestamp = new Date(row[timeField]);

      // Skip invalid dates
      if (isNaN(timestamp.getTime())) {
        return acc;
      }

      // Round to time bucket
      const bucket = roundToTimeUnit(timestamp, effectiveTimeUnit);
      const bucketKey = bucket.getTime(); // Use timestamp as key for grouping

      if (!acc[bucketKey]) {
        acc[bucketKey] = {
          date: bucket,
          values: [],
        };
      }

      const value = Number(row[valueField]);
      if (!isNaN(value)) {
        acc[bucketKey].values.push(value);
      }

      return acc;
    }, {} as Record<number, { date: Date; values: number[] }>);

    const aggregatedRes = Object.values(grouped)
      .map(({ date, values }) => {
        return [date, aggregateValues(aggregationType, values) ?? null];
      })
      .sort((a, b) => a[0].getTime() - b[0].getTime()); // Sort by time;

    return { aggregatedData: [[timeField, valueField], ...aggregatedRes] };
  } else {
    const categorical2Collection = Array.from(new Set(data.map((item) => item[colorColumn])));

    const grouped = data.reduce((acc, row) => {
      const timestamp = new Date(row[timeField]);

      // Skip invalid dates
      if (isNaN(timestamp.getTime())) {
        return acc;
      }

      // Round to time bucket
      const bucket = roundToTimeUnit(timestamp, effectiveTimeUnit);
      const bucketKey = bucket.getTime(); // Use timestamp as key for grouping

      // treate colorColumn value as string as it could be boolean and numerical
      const color = String(row[colorColumn] ?? '');
      const value = Number(row[valueField]);

      if (isNaN(value)) return acc;

      acc[bucketKey] ??= {};
      acc[bucketKey].date ??= bucket;
      acc[bucketKey][color] ??= [];
      acc[bucketKey][color].push(value);

      return acc;
    }, {} as Record<string, Record<string, number[]>>);

    const aggregatedRes = Object.entries(grouped)
      .map(([group, colorValues]) => {
        return [
          colorValues.date,
          ...categorical2Collection.map(
            (c) => aggregateValues(aggregationType, colorValues[c]) ?? null
          ),
        ];
      })
      .sort((a, b) => a[0].getTime() - b[0].getTime()); // Sort by time;;

    return {
      aggregatedData: [
        [timeField, ...categorical2Collection.map((c) => String(c))],
        ...aggregatedRes,
      ],
      categorical2Collection,
    };
  }
};
