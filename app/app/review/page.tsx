"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RuleReviewPanel } from "@/components/RuleReviewPanel";
import type { AuditRule } from "@/lib/types";

export default function ReviewPage() {
  const [rules, setRules] = useState<AuditRule[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rules?status=pending_review")
      .then((r) => r.json())
      .then((data) => {
        setRules(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleDecision(ruleId: string, status: "approved" | "rejected", note?: string) {
    await fetch(`/api/rules/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        note,
        approved_by: "auditor",
        approved_at: new Date().toISOString(),
      }),
    });
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
    setSelectedIdx((i) => Math.max(0, i - 1));
  }

  const pending = rules.filter((r) => r.status === "pending_review");
  const selected = pending[selectedIdx];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden">
      {/* Background Blurs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />

      {/* Nav */}
      <nav className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
            AuditGraph
          </Link>
          <span className="text-slate-650">/</span>
          <span className="text-sm font-medium text-slate-200">Review Queue</span>
          {pending.length > 0 && (
            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
              {pending.length} PENDING
            </span>
          )}
        </div>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-slate-400 hover:text-slate-200 transition-colors btn-active-scale">Dashboard</Link>
          <Link href="/rules" className="text-slate-400 hover:text-slate-200 transition-colors btn-active-scale">Rule Library</Link>
          <Link
            href="/run/new"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-lg text-xs shadow-lg shadow-indigo-500/10 btn-active-scale transition-all"
          >
            New Audit Run
          </Link>
        </div>
      </nav>

      {/* Main Review Workspace */}
      <div className="max-w-7xl w-full mx-auto px-6 py-6 flex gap-6 h-[calc(100vh-68px)] z-10">
        {/* Sidebar pending items */}
        <div className="w-72 shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono px-1">
            Rules Awaiting Verification
          </div>
          {loading ? (
            <div className="text-xs text-slate-500 font-mono px-1">Loading items...</div>
          ) : pending.length === 0 ? (
            <div className="text-xs text-slate-500 px-1 border border-dashed border-slate-900 p-4 rounded-lg">
              All rules reviewed.{" "}
              <Link href="/rules" className="text-indigo-400 underline font-semibold">
                View Library
              </Link>
            </div>
          ) : (
            pending.map((rule, i) => (
              <button
                key={rule.id}
                onClick={() => setSelectedIdx(i)}
                className={`text-left px-4 py-3 rounded-lg border text-xs transition-all cursor-pointer btn-active-scale relative overflow-hidden ${
                  i === selectedIdx
                    ? "bg-indigo-950/40 border-indigo-500/50 shadow-md shadow-indigo-500/5"
                    : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700/60"
                }`}
              >
                <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r bg-indigo-500 transition-all duration-200 ${i === selectedIdx ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50"}`} />
                <div className="pl-2.5">
                  <div className="font-mono font-bold text-slate-200">{rule.id}</div>
                  <div className="text-slate-400 mt-1 font-mono text-[10px] truncate">
                    § {rule.section} — {rule.description}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Central Workspace Panel */}
        <div className="flex-1 overflow-hidden h-full">
          {selected ? (
            <RuleReviewPanel rule={selected} onDecision={handleDecision} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
              {loading ? "Initializing review workspace..." : "Select a rule from the queue to start verification."}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
