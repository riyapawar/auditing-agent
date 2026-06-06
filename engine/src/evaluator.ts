import type { Condition, Assertion, Operator } from "./types.js";

export function evaluateCondition(
  condition: Condition,
  fields: Record<string, unknown>
): boolean {
  switch (condition.type) {
    case "always":
      return true;

    case "never":
      return false;

    case "field": {
      const actual = fields[condition.field];
      return applyOperator(actual, condition.operator, condition.value);
    }

    case "and":
      return condition.conditions.every((c) => evaluateCondition(c, fields));

    case "or":
      return condition.conditions.some((c) => evaluateCondition(c, fields));

    case "not":
      return !evaluateCondition(condition.condition, fields);

    default:
      return false;
  }
}

function applyOperator(
  actual: unknown,
  operator: Operator,
  expected: unknown
): boolean {
  switch (operator) {
    case "eq":
      return actual === expected;

    case "neq":
      return actual !== expected;

    case "gt":
      return typeof actual === "number" && typeof expected === "number"
        ? actual > expected
        : false;

    case "gte":
      return typeof actual === "number" && typeof expected === "number"
        ? actual >= expected
        : false;

    case "lt":
      return typeof actual === "number" && typeof expected === "number"
        ? actual < expected
        : false;

    case "lte":
      return typeof actual === "number" && typeof expected === "number"
        ? actual <= expected
        : false;

    case "in":
      return Array.isArray(expected) && expected.includes(actual);

    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);

    case "exists":
      return actual !== undefined && actual !== null;

    case "not_exists":
      return actual === undefined || actual === null;

    case "matches":
      return typeof actual === "string" && typeof expected === "string"
        ? new RegExp(expected).test(actual)
        : false;

    default:
      return false;
  }
}

export interface AssertionResult {
  passed: boolean;
  message?: string;
  expected?: unknown;
  actual?: unknown;
}

export function evaluateAssertion(
  assertion: Assertion,
  fields: Record<string, unknown>
): AssertionResult {
  const actual = fields[assertion.field];

  switch (assertion.type) {
    case "equals": {
      const passed = actual === assertion.value;
      return {
        passed,
        actual,
        expected: assertion.value,
        message: passed ? undefined : assertion.message,
      };
    }

    case "range": {
      if (typeof actual !== "number") {
        return { passed: false, actual, message: `${assertion.field} must be a number` };
      }
      const aboveMin = assertion.min === undefined || actual >= assertion.min;
      const belowMax = assertion.max === undefined || actual <= assertion.max;
      const passed = aboveMin && belowMax;
      return {
        passed,
        actual,
        expected: { min: assertion.min, max: assertion.max },
        message: passed ? undefined : assertion.message,
      };
    }

    case "exists": {
      const passed = actual !== undefined && actual !== null;
      return { passed, actual, message: passed ? undefined : assertion.message };
    }

    case "not_exists": {
      const passed = actual === undefined || actual === null;
      return { passed, actual, message: passed ? undefined : assertion.message };
    }

    case "in": {
      const passed = Array.isArray(assertion.values) && assertion.values.includes(actual);
      return {
        passed,
        actual,
        expected: assertion.values,
        message: passed ? undefined : assertion.message,
      };
    }

    default:
      return { passed: false, message: `Unknown assertion type: ${(assertion as Assertion).type}` };
  }
}

// Extracts only the fields referenced by a condition (for audit log snapshots)
export function referencedFields(condition: Condition): Set<string> {
  const fields = new Set<string>();
  function walk(c: Condition) {
    if (c.type === "field") {
      fields.add(c.field);
    } else if (c.type === "and" || c.type === "or") {
      c.conditions.forEach(walk);
    } else if (c.type === "not") {
      walk(c.condition);
    }
  }
  walk(condition);
  return fields;
}
