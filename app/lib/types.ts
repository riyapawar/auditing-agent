// Re-export engine types for use in the Next.js app
// Keep this in sync with engine/src/types.ts

export type Operator =
  | "eq" | "neq"
  | "gt" | "gte" | "lt" | "lte"
  | "in" | "not_in"
  | "exists" | "not_exists"
  | "matches";

export type Condition =
  | { type: "field"; field: string; operator: Operator; value?: unknown }
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] }
  | { type: "not"; condition: Condition }
  | { type: "always" }
  | { type: "never" };

export interface Assertion {
  type: "equals" | "range" | "exists" | "not_exists" | "in";
  field: string;
  value?: unknown;
  min?: number;
  max?: number;
  values?: unknown[];
  message: string;
}

export type RuleStatus = "pending_review" | "approved" | "rejected";

export interface AuditRule {
  id: string;
  standard: string;
  section: string;
  version: string;
  description: string;
  source_text: string;
  applies_to: string[];
  depends_on: string[];
  condition: Condition;
  assertion: Assertion;
  status: RuleStatus;
  approved_by?: string;
  approved_at?: string;
  content_hash: string;
  kg_source?: string;
  kg_relation?: string;
  kg_target?: string;
  classifier_confidence?: number;
}

export type AuditResult = "pass" | "fail" | "skip";

export interface AuditLogEntry {
  run_id: string;
  timestamp: string;
  transaction_id: string;
  rule_id: string;
  rule_standard: string;
  rule_section: string;
  condition_matched: boolean;
  assertion_result: boolean;
  result: AuditResult;
  input_snapshot: Record<string, unknown>;
  violation_message?: string;
}

export interface AuditRunSummary {
  run_id: string;
  started_at: string;
  completed_at: string;
  standard: string;
  rules_applied: number;
  transactions_tested: number;
  violations: number;
  by_rule: Record<string, { tested: number; violations: number }>;
  log_path: string;
}
