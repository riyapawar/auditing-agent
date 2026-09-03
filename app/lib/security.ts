import { createHash } from "crypto";
import type { AuditRule, Condition } from "@/lib/types";

// Helper to sort keys recursively for deterministic serialization
function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: any = {};
  for (const key of sortedKeys) {
    sortedObj[key] = sortObjectKeys(obj[key]);
  }
  return sortedObj;
}

// SHA-256 Rule Content Hashing matching python stage6_rule_classifier.py
export function hashRule(rule: any): string {
  const cleanRule: any = {};
  const excludedKeys = new Set(["id", "content_hash", "status", "approved_by", "approved_at"]);
  for (const [k, v] of Object.entries(rule)) {
    if (!excludedKeys.has(k)) {
      cleanRule[k] = v;
    }
  }
  const sorted = sortObjectKeys(cleanRule);
  const jsonStr = JSON.stringify(sorted);
  return createHash("sha256").update(jsonStr).digest("hex").slice(0, 16);
}

// Heuristic check to prevent Regular Expression Denial of Service (ReDoS)
export function isSafeRegex(pattern: string): boolean {
  // Reject nested quantifiers and repeated groups containing quantifiers e.g. (a+)+, (a*)*, (a+)*
  const nestedQuantifierRegex = /\([^)]*[\*\+]\)[?*+]/;
  if (nestedQuantifierRegex.test(pattern)) {
    return false;
  }
  // Reject overlapping alternations with repetitions e.g. (a|a)+, (\w|\s)*
  const overlappingAlternationRegex = /\([^)]+\|[a-zA-Z0-9_\s]*\)[\*\+]/;
  if (overlappingAlternationRegex.test(pattern)) {
    return false;
  }
  return true;
}

// Recursively validate rule regexes in condition fields
export function validateRuleRegexes(rule: AuditRule): boolean {
  return validateConditionRegexes(rule.condition);
}

function validateConditionRegexes(c: Condition): boolean {
  if (!c) return true;
  if (c.type === "field") {
    if (c.operator === "matches" && typeof c.value === "string") {
      return isSafeRegex(c.value);
    }
  } else if (c.type === "and" || c.type === "or") {
    return c.conditions.every(validateConditionRegexes);
  } else if (c.type === "not") {
    return validateConditionRegexes(c.condition);
  }
  return true;
}

// Enforce token validation check against administrative API keys
export function checkAdminAuth(headers: Headers): boolean {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return true; // Bypass validation if key is not configured in env (dev mode)
  const clientKey = headers.get("X-Admin-Api-Key");
  return clientKey === key;
}
