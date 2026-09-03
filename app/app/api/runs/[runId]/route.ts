import { NextRequest, NextResponse } from "next/server";
import { loadRuns } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const runs = loadRuns();
  const run = runs.find((r) => r.run_id === runId);
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(run);
}
