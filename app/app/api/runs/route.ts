import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { AuditExecutor } from "@auditing-agent/engine";
import type { Transaction } from "@/lib/types";
import { loadRules, loadRuns, saveRun, DATA_DIR } from "@/lib/db";

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

  const logPath = path.join(DATA_DIR, "logs", `${Date.now()}.jsonl`);
  
  try {
    const executor = new AuditExecutor(approvedRules, { logPath });
    const summary = await executor.run(transactions, standard);
    saveRun(summary);
    return NextResponse.json(summary);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to run engine: ${err.message}` },
      { status: 500 }
    );
  }
}
