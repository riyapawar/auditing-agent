import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { AuditLogEntry } from "@/lib/types";
import { loadRuns, DATA_DIR } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const runs = loadRuns();
  const run = runs.find((r) => r.run_id === runId);
  if (!run) return NextResponse.json([], { status: 404 });

  const resolvedLogPath = path.resolve(run.log_path);
  const allowedLogsDir = path.resolve(path.join(DATA_DIR, "logs"));
  if (!resolvedLogPath.startsWith(allowedLogsDir)) {
    return NextResponse.json({ error: "Access Denied: Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(resolvedLogPath)) return NextResponse.json([]);

  const lines = fs.readFileSync(resolvedLogPath, "utf-8").split("\n").filter(Boolean);
  const entries: AuditLogEntry[] = lines
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  return NextResponse.json(entries);
}
