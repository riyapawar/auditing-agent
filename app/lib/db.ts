import fs from "fs";
import path from "path";
import type { AuditRule, AuditRunSummary, Transaction } from "./types";

const IS_VERCEL = !!process.env.VERCEL;

export const DATA_DIR = IS_VERCEL
  ? path.join("/tmp", "data")
  : path.resolve(path.join(process.cwd(), "..", "data"));

export const RULES_PATH = path.join(DATA_DIR, "rules.json");
export const RUNS_PATH = path.join(DATA_DIR, "runs.json");
export const TX_PATH = path.join(DATA_DIR, "sample_transactions.json");

export function ensureInitialized(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Seed rules from original file in repository build assets
  const originalRules = path.resolve(path.join(process.cwd(), "..", "data", "rules.json"));
  if (IS_VERCEL && !fs.existsSync(RULES_PATH) && fs.existsSync(originalRules)) {
    try {
      fs.copyFileSync(originalRules, RULES_PATH);
    } catch (e) {
      console.error("Failed to seed rules on Vercel:", e);
    }
  }

  // Seed sample transactions from original file
  const originalTxs = path.resolve(path.join(process.cwd(), "..", "data", "sample_transactions.json"));
  if (IS_VERCEL && !fs.existsSync(TX_PATH) && fs.existsSync(originalTxs)) {
    try {
      fs.copyFileSync(originalTxs, TX_PATH);
    } catch (e) {
      console.error("Failed to seed transactions on Vercel:", e);
    }
  }
}

export function loadRules(): AuditRule[] {
  ensureInitialized();
  if (!fs.existsSync(RULES_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(RULES_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function saveRules(rules: AuditRule[]): void {
  ensureInitialized();
  fs.writeFileSync(RULES_PATH, JSON.stringify(rules, null, 2));
}

export function loadRuns(): AuditRunSummary[] {
  ensureInitialized();
  if (!fs.existsSync(RUNS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(RUNS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function saveRun(run: AuditRunSummary): void {
  ensureInitialized();
  const runs = loadRuns();
  runs.unshift(run);
  fs.writeFileSync(RUNS_PATH, JSON.stringify(runs, null, 2));
}

export function loadTransactions(): Transaction[] {
  ensureInitialized();
  if (!fs.existsSync(TX_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(TX_PATH, "utf-8"));
  } catch {
    return [];
  }
}
