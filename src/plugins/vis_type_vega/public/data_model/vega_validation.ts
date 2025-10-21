/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

interface ValidationResult {
  expression: string;
  pattern: string;
  location: string;
}

const harmfulPatterns = [
  /window\s*\./i,
  /event\s*\.view\s*\./i,
  /global\s*\./i,
  /__proto__/i,
  /constructor/i,
  /document\s*\./i,
  /eval\s*\(/i,
  /Function\s*\(/i,
];

/**
 * Valid Vega expression to block certain keywords which could possibly leads to security issue
 */
export function validateVegaExpression(spec: Record<string, any>) {
  const results: ValidationResult[] = [];

  // Fields that typically contain expressions
  const expressionFields = ['expr', 'update', 'test', 'calculate', 'filter', 'signal'];

  function traverse(obj: Record<string, any>, path = '') {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        traverse(item, `${path}[${index}]`);
      });
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Check if this is an expression field
      if (expressionFields.includes(key) && typeof value === 'string') {
        for (const harmfulPattern of harmfulPatterns) {
          if (harmfulPattern.test(value)) {
            results.push({
              expression: value,
              pattern: harmfulPattern.toString(),
              location: currentPath,
            });
            break;
          }
        }
      }

      // Recursively check nested objects
      traverse(value, currentPath);
    }
  }

  traverse(spec);
  return results;
}
