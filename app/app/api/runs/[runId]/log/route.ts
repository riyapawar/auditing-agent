import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { AuditLogEntry, AuditRunSummary } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "..", "data");
const RUNS_PATH = path.join(DATA_DIR, "runs.json");

export async function GET(_req: NextRequest, { params }: { params: { runId: string } }) {
  if (!fs.existsSync(RUNS_PATH)) return NextResponse.json([]);
  const runs: AuditRunSummary[] = JSON.parse(fs.readFileSync(RUNS_PATH, "utf-8"));
  const run = runs.find((r) => r.run_id === params.runId);
  if (!run) return NextResponse.json([], { status: 404 });

  if (!fs.existsSync(run.log_path)) return NextResponse.json([]);

  const lines = fs.readFileSync(run.log_path, "utf-8").split("\n").filter(Boolean);
  const entries: AuditLogEntry[] = lines
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  return NextResponse.json(entries);
}
