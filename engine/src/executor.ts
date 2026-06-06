import { randomUUID } from "crypto";
import type {
  AuditRule,
  Transaction,
  AuditLogEntry,
  AuditRunSummary,
} from "./types.js";
import { evaluateCondition, evaluateAssertion, referencedFields } from "./evaluator.js";
import { AuditLog } from "./audit_log.js";

export interface ExecutorOptions {
  logPath: string;
  onProgress?: (tested: number, total: number) => void;
}

export class AuditExecutor {
  private rules: AuditRule[];
  private sortedRuleIds: string[];
  private log: AuditLog;

  constructor(rules: AuditRule[], options: ExecutorOptions) {
    const approved = rules.filter((r) => r.status === "approved");
    if (approved.length === 0) {
      throw new Error("No approved rules. All rules must be reviewed before running.");
    }
    this.rules = approved;
    this.sortedRuleIds = topologicalSort(approved);
    this.log = new AuditLog(options.logPath);
  }

  async run(
    transactions: Transaction[],
    standard?: string
  ): Promise<AuditRunSummary> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();

    const byRule: Record<string, { tested: number; violations: number }> = {};
    let totalViolations = 0;

    const ruleMap = new Map(this.rules.map((r) => [r.id, r]));

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      for (const ruleId of this.sortedRuleIds) {
        const rule = ruleMap.get(ruleId)!;

        // Skip if this rule doesn't apply to this transaction type
        if (
          rule.applies_to.length > 0 &&
          !rule.applies_to.includes(tx.type) &&
          !rule.applies_to.includes("*")
        ) {
          continue;
        }

        // Check dependencies: skip if any dependency rule flagged this transaction
        const depViolated = rule.depends_on.some((depId) => {
          const depEntry = this.log.lastEntryFor(runId, tx.id, depId);
          return depEntry?.result === "fail";
        });
        if (depViolated) {
          this.log.append({
            run_id: runId,
            timestamp: new Date().toISOString(),
            transaction_id: tx.id,
            rule_id: rule.id,
            rule_standard: rule.standard,
            rule_section: rule.section,
            condition_matched: false,
            assertion_result: true,
            result: "skip",
            input_snapshot: {},
            violation_message: `Skipped: dependency rule ${rule.depends_on.join(",")} violated`,
          });
          continue;
        }

        const conditionMet = evaluateCondition(rule.condition, tx.fields);

        // Capture only the fields the condition and assertion reference
        const referenced = referencedFields(rule.condition);
        referenced.add(rule.assertion.field);
        const snapshot: Record<string, unknown> = {};
        for (const f of referenced) {
          snapshot[f] = tx.fields[f];
        }

        if (!conditionMet) {
          // Condition not triggered — rule doesn't apply to this transaction
          this.log.append({
            run_id: runId,
            timestamp: new Date().toISOString(),
            transaction_id: tx.id,
            rule_id: rule.id,
            rule_standard: rule.standard,
            rule_section: rule.section,
            condition_matched: false,
            assertion_result: true,
            result: "skip",
            input_snapshot: snapshot,
          });
          continue;
        }

        const assertionResult = evaluateAssertion(rule.assertion, tx.fields);

        byRule[rule.id] = byRule[rule.id] ?? { tested: 0, violations: 0 };
        byRule[rule.id].tested++;

        const entry: AuditLogEntry = {
          run_id: runId,
          timestamp: new Date().toISOString(),
          transaction_id: tx.id,
          rule_id: rule.id,
          rule_standard: rule.standard,
          rule_section: rule.section,
          condition_matched: true,
          assertion_result: assertionResult.passed,
          result: assertionResult.passed ? "pass" : "fail",
          input_snapshot: snapshot,
          violation_message: assertionResult.passed ? undefined : assertionResult.message,
        };

        if (!assertionResult.passed) {
          byRule[rule.id].violations++;
          totalViolations++;
        }

        this.log.append(entry);
      }
    }

    await this.log.flush();

    const summary: AuditRunSummary = {
      run_id: runId,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      standard: standard ?? this.rules[0]?.standard ?? "Unknown",
      rules_applied: this.sortedRuleIds.length,
      transactions_tested: transactions.length,
      violations: totalViolations,
      by_rule: byRule,
      log_path: this.log.path,
    };

    return summary;
  }
}

// Kahn's algorithm for topological sort on rule dependency graph
function topologicalSort(rules: AuditRule[]): string[] {
  const ids = new Set(rules.map((r) => r.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const rule of rules) {
    if (!inDegree.has(rule.id)) inDegree.set(rule.id, 0);
    if (!adjacency.has(rule.id)) adjacency.set(rule.id, []);
  }

  for (const rule of rules) {
    for (const dep of rule.depends_on) {
      if (!ids.has(dep)) continue; // dependency not in approved set, skip
      adjacency.get(dep)!.push(rule.id);
      inDegree.set(rule.id, (inDegree.get(rule.id) ?? 0) + 1);
    }
  }

  const queue = [...inDegree.entries()]
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id);
  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const deg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (sorted.length !== rules.length) {
    throw new Error(
      "Cycle detected in rule dependency graph. Check depends_on fields for circular dependencies."
    );
  }

  return sorted;
}

// Build React Flow nodes/edges for a single transaction's trace
export function buildTrace(
  runId: string,
  transactionId: string,
  entries: AuditLogEntry[],
  rules: AuditRule[]
) {
  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  const txEntries = entries.filter(
    (e) => e.run_id === runId && e.transaction_id === transactionId
  );

  const nodes: Array<{ id: string; type: string; data: Record<string, unknown> }> = [
    {
      id: `tx-${transactionId}`,
      type: "transaction",
      data: { label: `Transaction ${transactionId}` },
    },
  ];

  const edges: Array<{ id: string; source: string; target: string; label?: string }> = [];

  for (const entry of txEntries) {
    if (entry.result === "skip") continue;
    const rule = ruleMap.get(entry.rule_id);
    const nodeId = `rule-${entry.rule_id}`;

    nodes.push({
      id: nodeId,
      type: entry.result === "fail" ? "violation" : "rule",
      data: {
        label: `${entry.rule_id}`,
        detail: rule
          ? `${rule.section}: ${rule.description}`
          : entry.violation_message ?? "",
        result: entry.result,
      },
    });

    edges.push({
      id: `e-${transactionId}-${entry.rule_id}`,
      source: `tx-${transactionId}`,
      target: nodeId,
      label: entry.result,
    });

    // Dependency edges between rules
    for (const dep of rule?.depends_on ?? []) {
      edges.push({
        id: `dep-${dep}-${entry.rule_id}`,
        source: `rule-${dep}`,
        target: nodeId,
        label: "depends_on",
      });
    }
  }

  return { nodes, edges };
}
