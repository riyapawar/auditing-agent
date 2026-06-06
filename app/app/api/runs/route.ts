import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { AuditRule, AuditRunSummary, Transaction } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "..", "data");
const RULES_PATH = path.join(DATA_DIR, "rules.json");
const RUNS_PATH = path.join(DATA_DIR, "runs.json");

function loadRules(): AuditRule[] {
  if (!fs.existsSync(RULES_PATH)) return [];
  return JSON.parse(fs.readFileSync(RULES_PATH, "utf-8"));
}

function loadRuns(): AuditRunSummary[] {
  if (!fs.existsSync(RUNS_PATH)) return [];
  return JSON.parse(fs.readFileSync(RUNS_PATH, "utf-8"));
}

function saveRun(run: AuditRunSummary): void {
  const runs = loadRuns();
  runs.unshift(run);
  fs.mkdirSync(path.dirname(RUNS_PATH), { recursive: true });
  fs.writeFileSync(RUNS_PATH, JSON.stringify(runs, null, 2));
}

export async function GET() {
  return NextResponse.json(loadRuns());
}

// POST /api/runs — start a new audit run
// Body: { transactions: Transaction[], standard?: string }
export async function POST(req: NextRequest) {
  const { transactions, standard } = (await req.json()) as {
    transactions: Transaction[];
    standard?: string;
  };

  if (!transactions || transactions.length === 0) {
    return NextResponse.json({ error: "No transactions provided" }, { status: 400 });
  }

  const approvedRules = loadRules().filter((r) => r.status === "approved");
  if (approvedRules.length === 0) {
    return NextResponse.json(
      { error: "No approved rules. Review and approve rules before running." },
      { status: 400 }
    );
  }

  // Import engine dynamically — only works when engine is built
  // For development, run: cd engine && npm run build
  let AuditExecutor: typeof import("@auditing-agent/engine").AuditExecutor;
  try {
    ({ AuditExecutor } = await import("@auditing-agent/engine" as never as string));
  } catch {
    return NextResponse.json(
      { error: "Engine not built. Run: cd engine && npm run build" },
      { status: 500 }
    );
  }

  const logPath = path.join(DATA_DIR, "logs", `${Date.now()}.jsonl`);
  const executor = new AuditExecutor(approvedRules, { logPath });
  const summary = await executor.run(transactions, standard);

  saveRun(summary);
  return NextResponse.json(summary);
}
