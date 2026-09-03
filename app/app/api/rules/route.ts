import { NextRequest, NextResponse } from "next/server";
import type { AuditRule, RuleStatus } from "@/lib/types";
import { checkAdminAuth, hashRule, validateRuleRegexes } from "@/lib/security";
import { loadRules, saveRules } from "@/lib/db";

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
  // Check authorization
  if (!checkAdminAuth(req.headers)) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  const body = await req.json();
  const incoming: AuditRule[] = Array.isArray(body) ? body : [body];

  const existing = loadRules();
  const existingIds = new Set(existing.map((r) => r.id));

  const added: AuditRule[] = [];
  for (const rule of incoming) {
    // 1. Verify content hash (Integrity Protection)
    const computed = hashRule(rule);
    if (rule.content_hash !== computed) {
      return NextResponse.json(
        { error: `Rule integrity check failed for ${rule.id}. Hash mismatch.` },
        { status: 400 }
      );
    }

    // 2. Validate regexes (ReDoS Prevention)
    if (!validateRuleRegexes(rule)) {
      return NextResponse.json(
        { error: `Rule ${rule.id} contains potentially unsafe regular expressions (ReDoS risk).` },
        { status: 400 }
      );
    }

    if (!existingIds.has(rule.id)) {
      added.push({ ...rule, status: "pending_review" });
    }
  }

  saveRules([...existing, ...added]);
  return NextResponse.json({ added: added.length, total: existing.length + added.length });
}
