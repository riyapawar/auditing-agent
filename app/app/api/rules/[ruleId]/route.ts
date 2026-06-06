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

export async function GET(_req: NextRequest, { params }: { params: { ruleId: string } }) {
  const rules = loadRules();
  const rule = rules.find((r) => r.id === params.ruleId);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rule);
}

export async function PATCH(req: NextRequest, { params }: { params: { ruleId: string } }) {
  const body = await req.json();
  const { status, approved_by, approved_at } = body as {
    status: RuleStatus;
    approved_by?: string;
    approved_at?: string;
  };

  const rules = loadRules();
  const idx = rules.findIndex((r) => r.id === params.ruleId);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  rules[idx] = { ...rules[idx], status, approved_by, approved_at };
  saveRules(rules);
  return NextResponse.json(rules[idx]);
}
