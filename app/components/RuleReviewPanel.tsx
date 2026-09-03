"use client";

import { useState } from "react";
import type { AuditRule, RuleStatus } from "@/lib/types";

interface Props {
  rule: AuditRule;
  onDecision: (ruleId: string, status: "approved" | "rejected", note?: string) => Promise<void>;
}

export function RuleReviewPanel({ rule, onDecision }: Props) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function decide(status: "approved" | "rejected") {
    setLoading(true);
    await onDecision(rule.id, status, note);
    setNote("");
    setLoading(false);
  }

  const confidencePct = rule.classifier_confidence
    ? Math.round(rule.classifier_confidence * 100)
    : null;

  return (
    <div className="grid grid-cols-2 gap-0 h-full border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/50 backdrop-blur-md shadow-2xl">
      {/* Left: source regulatory text */}
      <div className="bg-slate-950/50 p-6 border-r border-slate-800/60 overflow-y-auto flex flex-col gap-4">
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1">
            Source Regulation
          </div>
          <div className="text-xs font-mono font-bold text-indigo-400">
            {rule.standard} § {rule.section}
          </div>
        </div>

        <div className="flex-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-2">
            Reference Paragraph
          </div>
          {rule.source_text ? (
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-950/40 border border-slate-900 p-4 rounded-lg font-sans">
              {rule.source_text}
            </p>
          ) : (
            <p className="text-sm text-slate-500 italic bg-slate-950/20 border border-slate-900 p-4 rounded-lg">
              Source text not available
            </p>
          )}
        </div>

        {rule.kg_source && (
          <div className="mt-4 pt-4 border-t border-slate-800/60">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-2">
              Knowledge Graph Linkage
            </div>
            <div className="text-xs font-mono bg-slate-950/80 border border-slate-900 rounded-lg p-3 text-slate-400 leading-normal">
              <span className="text-indigo-400">{rule.kg_source}</span>
              <span className="text-slate-600 px-1.5">→[{rule.kg_relation}]→</span>
              <span className="text-cyan-400">{rule.kg_target}</span>
            </div>
            {confidencePct !== null && (
              <div className="mt-2 text-[10px] text-slate-500 font-mono">
                Model Classifier Confidence: <span className="text-slate-300 font-bold">{confidencePct}%</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: extracted rule */}
      <div className="bg-slate-900/40 p-6 overflow-y-auto flex flex-col gap-5">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-0.5">
              Rule ID
            </div>
            <code className="text-xs font-mono font-bold text-indigo-400 bg-indigo-950/40 border border-indigo-900/40 px-2 py-0.5 rounded">
              {rule.id}
            </code>
          </div>
          <StatusBadge status={rule.status} />
        </div>

        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1.5">
            Rule Description
          </div>
          <p className="text-sm text-slate-200 leading-relaxed font-medium">{rule.description}</p>
        </div>

        {rule.applies_to.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1.5">
              Applies To Transaction Types
            </div>
            <div className="flex flex-wrap gap-1.5">
              {rule.applies_to.map((t) => (
                <span
                  key={t}
                  className="px-2.5 py-0.5 bg-indigo-950/40 border border-indigo-900/40 text-indigo-300 text-[10px] rounded-full font-mono"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1.5">
            Condition Check (when rule triggers)
          </div>
          <pre className="text-xs bg-slate-950 border border-slate-900 rounded-lg p-3 overflow-x-auto text-cyan-400 font-mono">
            {JSON.stringify(rule.condition, null, 2)}
          </pre>
        </div>

        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1.5">
            Assertion Check (what must be true)
          </div>
          <pre className="text-xs bg-slate-950 border border-slate-900 rounded-lg p-3 overflow-x-auto text-emerald-400 font-mono">
            {JSON.stringify(rule.assertion, null, 2)}
          </pre>
          <div className="mt-2 text-xs text-amber-400/90 italic bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-lg">
            Violation Message: &quot;{rule.assertion.message}&quot;
          </div>
        </div>

        {rule.depends_on.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1.5">
              Depends On Rules
            </div>
            <div className="flex flex-wrap gap-1.5">
              {rule.depends_on.map((dep) => (
                <code key={dep} className="text-[10px] font-mono text-slate-300 bg-slate-950 border border-slate-900 px-2 py-0.5 rounded">
                  {dep}
                </code>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto pt-4 border-t border-slate-800/60">
          {rule.status === "pending_review" && (
            <>
              <textarea
                className="w-full text-xs bg-slate-950 border border-slate-800/80 rounded-lg p-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all duration-200 focus:ring-1 focus:ring-indigo-500/20 resize-none"
                rows={2}
                placeholder="Optional auditor review note..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2.5 mt-3">
                <button
                  onClick={() => decide("approved")}
                  disabled={loading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-lg transition-all cursor-pointer shadow-lg shadow-emerald-500/10 btn-active-scale"
                >
                  Approve Rule
                </button>
                <button
                  onClick={() => decide("rejected")}
                  disabled={loading}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-lg transition-all cursor-pointer shadow-lg shadow-rose-500/10 btn-active-scale"
                >
                  Reject Rule
                </button>
              </div>
            </>
          )}
          {rule.status !== "pending_review" && rule.approved_by && (
            <p className="text-xs text-slate-500 font-mono">
              Status set to {rule.status} by <span className="text-slate-400 font-semibold">{rule.approved_by}</span>
              {rule.approved_at && ` on ${new Date(rule.approved_at).toLocaleDateString()}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RuleStatus }) {
  const styles: Record<RuleStatus, string> = {
    pending_review: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    approved: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    rejected: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  };
  const labels: Record<RuleStatus, string> = {
    pending_review: "Pending Review",
    approved: "Approved",
    rejected: "Rejected",
  };
  return (
    <span className={`text-[10px] font-bold border px-2.5 py-0.5 rounded-full font-mono uppercase tracking-wider ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
