import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { AuditRule, RuleStatus } from "@/lib/types";

const RULES_PATH = path.join(process.cwd(), "..", "data", "rules.json");

function loadRules(): AuditRule[] {
  if (!fs.existsSync(RULES_PATH)) return [];
  return JSON.parse(fs.readFileSync(RULES_PATH, "utf-8"));
}

function saveRules(rules: AuditRule[]): void {
  fs.mkdirSync(path.dirname(RULES_PATH), { recursive: true });
  fs.writeFileSync(RULES_PATH, JSON.stringify(rules, null, 2));
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") as RuleStatus | null;
  const standard = req.nextUrl.searchParams.get("standard");

  let rules = loadRules();
  if (status) rules = rules.filter((r) => r.status === status);
  if (standard) rules = rules.filter((r) => r.standard === standard);

  return NextResponse.json(rules);
}

// Bulk import rules from stage6 output (POST /api/rules with array body)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const incoming: AuditRule[] = Array.isArray(body) ? body : [body];

  const existing = loadRules();
  const existingIds = new Set(existing.map((r) => r.id));

  const added: AuditRule[] = [];
  for (const rule of incoming) {
    if (!existingIds.has(rule.id)) {
      added.push({ ...rule, status: "pending_review" });
    }
  }

  saveRules([...existing, ...added]);
  return NextResponse.json({ added: added.length, total: existing.length + added.length });
}
