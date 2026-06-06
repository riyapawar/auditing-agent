import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { AuditRule } from "@/lib/types";

const RULES_PATH = path.join(process.cwd(), "..", "data", "rules.json");

export async function GET() {
  if (!fs.existsSync(RULES_PATH)) {
    return NextResponse.json({ total: 0, pending: 0, approved: 0, rejected: 0 });
  }
  const rules: AuditRule[] = JSON.parse(fs.readFileSync(RULES_PATH, "utf-8"));
  return NextResponse.json({
    total: rules.length,
    pending: rules.filter((r) => r.status === "pending_review").length,
    approved: rules.filter((r) => r.status === "approved").length,
    rejected: rules.filter((r) => r.status === "rejected").length,
  });
}
