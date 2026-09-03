import { NextResponse } from "next/server";
import { loadRules } from "@/lib/db";

export async function GET() {
  const rules = loadRules();
  return NextResponse.json({
    total: rules.length,
    pending: rules.filter((r) => r.status === "pending_review").length,
    approved: rules.filter((r) => r.status === "approved").length,
    rejected: rules.filter((r) => r.status === "rejected").length,
  });
}
