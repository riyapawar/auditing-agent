import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { AuditRunSummary } from "@/lib/types";

const RUNS_PATH = path.join(process.cwd(), "..", "data", "runs.json");

export async function GET(_req: NextRequest, { params }: { params: { runId: string } }) {
  if (!fs.existsSync(RUNS_PATH)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const runs: AuditRunSummary[] = JSON.parse(fs.readFileSync(RUNS_PATH, "utf-8"));
  const run = runs.find((r) => r.run_id === params.runId);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(run);
}
