/**
 * validate.mjs — standalone end-to-end validation script
 * Runs the audit engine directly against sample transactions.
 * Usage: node validate.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import engine directly from dist
const { AuditExecutor } = await import("./engine/dist/index.js");

const RULES_PATH = path.join(__dirname, "data", "rules.json");
const TX_PATH = path.join(__dirname, "data", "sample_transactions.json");
const LOG_DIR = path.join(__dirname, "data", "logs");
mkdirSync(LOG_DIR, { recursive: true });

const allRules = JSON.parse(readFileSync(RULES_PATH, "utf-8"));
const approvedRules = allRules.filter(r => r.status === "approved");
const transactions = JSON.parse(readFileSync(TX_PATH, "utf-8"));

console.log(`\n${"=".repeat(60)}`);
console.log(`  Deterministic Audit Engine — Validation Run`);
console.log(`${"=".repeat(60)}`);
console.log(`  Approved rules : ${approvedRules.length}`);
console.log(`  Transactions   : ${transactions.length}`);
console.log(`${"=".repeat(60)}\n`);

const logPath = path.join(LOG_DIR, `validate-${Date.now()}.jsonl`);
const executor = new AuditExecutor(approvedRules, { logPath });
const summary = await executor.run(transactions, "ASC 606");

// Pretty-print results
console.log(`Run ID       : ${summary.run_id}`);
console.log(`Rules applied: ${summary.rules_applied}`);
console.log(`Transactions : ${summary.transactions_tested}`);
console.log(`Violations   : ${summary.violations}`);
console.log(`Log written  : ${logPath}\n`);

// Show per-transaction breakdown
const logLines = readFileSync(logPath, "utf-8").trim().split("\n").map(l => JSON.parse(l));
const byTx = {};
for (const e of logLines) {
  if (!byTx[e.transaction_id]) byTx[e.transaction_id] = [];
  byTx[e.transaction_id].push(e);
}

for (const [txId, entries] of Object.entries(byTx)) {
  const tx = transactions.find(t => t.id === txId);
  const fails = entries.filter(e => e.result === "fail");
  const passes = entries.filter(e => e.result === "pass");
  const status = fails.length > 0 ? "VIOLATION" : "CLEAN";
  const icon = fails.length > 0 ? "✗" : "✓";
  console.log(`${icon} ${txId} [${tx?.type}] — ${status}`);
  for (const f of fails) {
    console.log(`    FAIL  ${f.rule_id}: ${f.violation_message}`);
    console.log(`          fields: ${JSON.stringify(f.input_snapshot)}`);
  }
  for (const p of passes) {
    console.log(`    pass  ${p.rule_id}`);
  }
  console.log();
}

// Summary
console.log(`${"=".repeat(60)}`);
if (summary.violations === 0) {
  console.log(`  All transactions CLEAN — no violations detected.`);
} else {
  console.log(`  ${summary.violations} violation(s) detected across ${Object.values(summary.by_rule).filter(r => r.violations > 0).length} rule(s).`);
  console.log(`\n  Rules with violations:`);
  for (const [ruleId, stats] of Object.entries(summary.by_rule)) {
    if (stats.violations > 0) {
      const rule = approvedRules.find(r => r.id === ruleId);
      console.log(`    ${ruleId}: ${stats.violations}/${stats.tested} transactions — ${rule?.description}`);
    }
  }
}
console.log(`${"=".repeat(60)}\n`);
