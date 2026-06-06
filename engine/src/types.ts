// Rule DSL and audit types — shared between engine and Next.js app
// Mirrors the Python rule schema produced by stage6_rule_classifier.py

export type Operator =
  | "eq" | "neq"
  | "gt" | "gte" | "lt" | "lte"
  | "in" | "not_in"
  | "exists" | "not_exists"
  | "matches"; // regex match for string fields

export type Condition =
  | { type: "field"; field: string; operator: Operator; value?: unknown }
  | { type: "and"; conditions: Condition[] }
  | { type: "or"; conditions: Condition[] }
  | { type: "not"; condition: Condition }
  | { type: "always" }  // unconditionally applies
  | { type: "never" };  // never applies (disabled rule)

export type AssertionType =
  | "equals"
  | "range"
  | "exists"
  | "not_exists"
  | "in"
  | "custom";

export interface Assertion {
  type: AssertionType;
  field: string;
  value?: unknown;            // for equals
  min?: number;               // for range
  max?: number;               // for range
  values?: unknown[];         // for in
  message: string;            // human-readable violation message shown in UI and report
}

export type RuleStatus = "pending_review" | "approved" | "rejected";

export interface AuditRule {
  id: string;                 // e.g. "ASC606-R-0001"
  standard: string;           // e.g. "ASC 606"
  section: string;            // e.g. "606-10-25-1"
  version: string;            // e.g. "2014-09" — used for temporal rule matching
  description: string;
  source_text: string;        // original regulatory paragraph
  applies_to: string[];       // transaction types this rule tests
  depends_on: string[];       // rule IDs that must be evaluated first (DAG edges)
  condition: Condition;       // when to apply the assertion
  assertion: Assertion;       // what must be true
  status: RuleStatus;
  approved_by?: string;
  approved_at?: string;
  content_hash: string;       // SHA-256 of rule content for tamper detection
  // KG provenance — the graph edges this rule was derived from
  kg_source?: string;
  kg_relation?: string;
  kg_target?: string;
  classifier_confidence?: number;
}

// A single financial transaction record passed to the engine
export interface Transaction {
  id: string;
  date: string;               // ISO 8601
  type: string;               // must match AuditRule.applies_to values
  fields: Record<string, unknown>;
}

export type AuditResult = "pass" | "fail" | "skip";

// One entry in the append-only audit log
export interface AuditLogEntry {
  run_id: string;
  timestamp: string;          // ISO 8601
  transaction_id: string;
  rule_id: string;
  rule_standard: string;
  rule_section: string;
  condition_matched: boolean; // whether the condition was triggered
  assertion_result: boolean;  // whether the assertion passed
  result: AuditResult;
  input_snapshot: Record<string, unknown>; // fields evaluated, not full transaction
  violation_message?: string;
}

// Summary produced at the end of a run
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

// Node type for React Flow trace visualization
export interface TraceNode {
  id: string;
  type: "transaction" | "rule" | "violation" | "pass";
  data: {
    label: string;
    detail?: string;
    result?: AuditResult;
  };
}

export interface TraceEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}
