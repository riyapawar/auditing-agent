"use client";

import { useEffect, useState } from "react";
import { RuleReviewPanel } from "@/components/RuleReviewPanel";
import type { AuditRule } from "@/lib/types";

export default function ReviewPage() {
  const [rules, setRules] = useState<AuditRule[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rules?status=pending_review")
      .then((r) => r.json())
      .then((data) => { setRules(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleDecision(ruleId: string, status: "approved" | "rejected", note?: string) {
    await fetch(`/api/rules/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note, approved_by: "reviewer", approved_at: new Date().toISOString() }),
    });
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
    setSelectedIdx((i) => Math.max(0, i - 1));
  }

  const pending = rules.filter((r) => r.status === "pending_review");
  const selected = pending[selectedIdx];

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <a href="/" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</a>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900">Review Queue</span>
        {pending.length > 0 && (
          <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-0.5 rounded-full">
            {pending.length} pending
          </span>
        )}
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-6 flex gap-5 h-[calc(100vh-56px)]">
        {/* Sidebar */}
        <div className="w-64 shrink-0 flex flex-col gap-1 overflow-y-auto">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
            Pending Rules
          </div>
          {loading ? (
            <div className="text-sm text-gray-400 px-1">Loading...</div>
          ) : pending.length === 0 ? (
            <div className="text-sm text-gray-400 px-1">
              All rules reviewed. <a href="/rules" className="text-indigo-600 underline">View library</a>
            </div>
          ) : (
            pending.map((rule, i) => (
              <button
                key={rule.id}
                onClick={() => setSelectedIdx(i)}
                className={`text-left px-3 py-2 rounded text-xs transition-colors ${
                  i === selectedIdx
                    ? "bg-indigo-50 border border-indigo-200 text-indigo-700"
                    : "hover:bg-gray-100 text-gray-600"
                }`}
              >
                <div className="font-mono font-medium">{rule.id}</div>
                <div className="text-gray-400 mt-0.5 truncate">{rule.section}</div>
              </button>
            ))
          )}
        </div>

        {/* Review panel */}
        <div className="flex-1 overflow-hidden rounded-lg">
          {selected ? (
            <RuleReviewPanel rule={selected} onDecision={handleDecision} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              {loading ? "Loading rules..." : "Select a rule to review"}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
