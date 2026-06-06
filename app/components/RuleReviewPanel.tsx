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
    setLoading(false);
  }

  const confidencePct = rule.classifier_confidence
    ? Math.round(rule.classifier_confidence * 100)
    : null;

  return (
    <div className="grid grid-cols-2 gap-0 h-full border border-gray-200 rounded-lg overflow-hidden">
      {/* Left: source regulatory text */}
      <div className="bg-gray-50 p-5 border-r border-gray-200 overflow-y-auto">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Source Text
        </div>
        <div className="text-xs font-mono text-gray-500 mb-3">
          {rule.standard} § {rule.section}
        </div>
        {rule.source_text ? (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {rule.source_text}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">Source text not available</p>
        )}
        {rule.kg_source && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              KG Provenance
            </div>
            <div className="text-xs font-mono bg-white border border-gray-200 rounded p-2 text-gray-600">
              {rule.kg_source} →[{rule.kg_relation}]→ {rule.kg_target}
            </div>
            {confidencePct !== null && (
              <div className="mt-1 text-xs text-gray-400">
                Classifier confidence: {confidencePct}%
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: extracted rule */}
      <div className="bg-white p-5 overflow-y-auto flex flex-col gap-5">
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Rule ID
          </div>
          <code className="text-sm font-mono text-indigo-600">{rule.id}</code>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Description
          </div>
          <p className="text-sm text-gray-800">{rule.description}</p>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Applies To
          </div>
          <div className="flex flex-wrap gap-1">
            {rule.applies_to.length > 0 ? (
              rule.applies_to.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
                >
                  {t}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-400">All transaction types</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Condition (when rule fires)
          </div>
          <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto text-gray-700">
            {JSON.stringify(rule.condition, null, 2)}
          </pre>
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Assertion (what must be true)
          </div>
          <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto text-gray-700">
            {JSON.stringify(rule.assertion, null, 2)}
          </pre>
          <div className="mt-1 text-xs text-orange-600 italic">
            Violation message: &quot;{rule.assertion.message}&quot;
          </div>
        </div>

        {rule.depends_on.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Depends On
            </div>
            <div className="flex flex-wrap gap-1">
              {rule.depends_on.map((dep) => (
                <code key={dep} className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                  {dep}
                </code>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto pt-4 border-t border-gray-100">
          <StatusBadge status={rule.status} />
          {rule.status === "pending_review" && (
            <>
              <textarea
                className="mt-3 w-full text-sm border border-gray-200 rounded p-2 resize-none"
                rows={2}
                placeholder="Optional review note..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => decide("approved")}
                  disabled={loading}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide("rejected")}
                  disabled={loading}
                  className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition-colors"
                >
                  Reject
                </button>
              </div>
            </>
          )}
          {rule.status !== "pending_review" && rule.approved_by && (
            <p className="mt-2 text-xs text-gray-400">
              {rule.status === "approved" ? "Approved" : "Rejected"} by {rule.approved_by}
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
    pending_review: "bg-yellow-50 text-yellow-700 border-yellow-200",
    approved: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };
  const labels: Record<RuleStatus, string> = {
    pending_review: "Pending Review",
    approved: "Approved",
    rejected: "Rejected",
  };
  return (
    <span className={`inline-block text-xs font-medium border px-2 py-0.5 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
