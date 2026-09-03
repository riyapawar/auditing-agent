import { NextRequest, NextResponse } from "next/server";
import type { RuleStatus } from "@/lib/types";
import { checkAdminAuth } from "@/lib/security";
import { loadRules, saveRules } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await params;
  const rules = loadRules();
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rule);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
  if (!checkAdminAuth(req.headers)) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  const { ruleId } = await params;
  const body = await req.json();
  const { status, approved_by, approved_at } = body as {
    status: RuleStatus;
    approved_by?: string;
    approved_at?: string;
  };

  const rules = loadRules();
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  rules[idx] = { ...rules[idx], status, approved_by, approved_at };
  saveRules(rules);
  return NextResponse.json(rules[idx]);
}
