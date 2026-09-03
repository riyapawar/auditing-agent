"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AuditRule, RuleStatus } from "@/lib/types";

const STATUS_LABELS: Record<RuleStatus, string> = {
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<RuleStatus, string> = {
  pending_review: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  rejected: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
};

export default function RuleLibraryPage() {
  const [rules, setRules] = useState<AuditRule[]>([]);
  const [filter, setFilter] = useState<RuleStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => r.json())
      .then((d) => {
        setRules(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const visible = rules.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.id.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.section.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden">
      {/* Background Blurs */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />

      {/* Nav */}
      <nav className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
            AuditGraph
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-sm font-medium text-slate-200">Rule Library</span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-slate-400 hover:text-slate-200 transition-colors btn-active-scale">Dashboard</Link>
          <Link href="/review" className="text-slate-400 hover:text-slate-200 transition-colors btn-active-scale">Review Queue</Link>
          <Link
            href="/run/new"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-lg text-xs shadow-lg shadow-indigo-500/10 btn-active-scale transition-all"
          >
            New Audit Run
          </Link>
        </div>
      </nav>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 flex flex-col gap-6 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Rule Library</h1>
            <p className="text-sm text-slate-400 mt-1">
              Deterministic guidelines automatically derived from accounting regulations.
            </p>
          </div>
          <Link
            href="/review"
            className="text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-indigo-400 border border-slate-800 px-4 py-2.5 rounded-lg transition-all btn-active-scale"
          >
            Go to Review Queue →
          </Link>
        </div>

        {/* Filter Controls */}
        <div className="flex gap-3 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/80">
          <input
            type="text"
            placeholder="Search rules by ID, description, or regulatory section..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-all duration-200 focus:ring-1 focus:ring-indigo-500/20 font-sans"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as RuleStatus | "all")}
            className="text-sm bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 transition-all duration-200 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="pending_review">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-20 text-sm text-slate-500">
            Loading rule library...
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20 text-sm text-slate-500 border border-dashed border-slate-800 rounded-xl">
            No rules matching the query were found.
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((rule) => {
              const isExpanded = expanded === rule.id;
              return (
                <div
                  key={rule.id}
                  className={`bg-slate-900/40 backdrop-blur-md border rounded-xl overflow-hidden transition-all duration-200 ${
                    isExpanded ? "border-slate-700/80 shadow-2xl" : "border-slate-800/80 hover:border-slate-700/60"
                  }`}
                >
                  {/* Card Header Trigger */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : rule.id)}
                    className="w-full text-left px-5 py-4.5 flex items-center gap-4 hover:bg-slate-900/20 transition-all btn-active-scale"
                  >
                    <code className="text-xs font-mono font-bold text-indigo-400 shrink-0 bg-indigo-950/40 border border-indigo-900/40 px-2 py-1 rounded">
                      {rule.id}
                    </code>
                    <span className="text-sm text-slate-200 flex-1 truncate font-medium">{rule.description}</span>
                    <span className="text-xs text-slate-500 shrink-0 font-mono">§ {rule.section}</span>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full shrink-0 font-mono uppercase tracking-wider ${STATUS_STYLES[rule.status]}`}>
                      {STATUS_LABELS[rule.status]}
                    </span>
                    <span className={`text-slate-655 text-xs pl-2 transition-transform duration-200 inline-block ${isExpanded ? "rotate-180" : ""}`}>
                      ▼
                    </span>
                  </button>

                  {/* Expanded Content Details */}
                  <div className={`grid transition-[grid-template-rows] duration-200 ease-[var(--ease-out)] ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <div className="border-t border-slate-800/60 bg-slate-950/40 px-6 py-5 grid grid-cols-2 gap-5 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-2">
                            Condition (when rule fires)
                          </div>
                          <pre className="bg-slate-950 border border-slate-850 rounded-lg p-3 overflow-x-auto text-cyan-400 font-mono max-h-[220px]">
                            {JSON.stringify(rule.condition, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-2">
                            Assertion (what must be true)
                          </div>
                          <pre className="bg-slate-950 border border-slate-850 rounded-lg p-3 overflow-x-auto text-emerald-400 font-mono max-h-[220px]">
                            {JSON.stringify(rule.assertion, null, 2)}
                          </pre>
                        </div>

                        {rule.applies_to.length > 0 && (
                          <div className="col-span-2">
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-2">
                              Applicable Transaction Types
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {rule.applies_to.map((t) => (
                                <span
                                  key={t}
                                  className="bg-indigo-950/40 border border-indigo-900/40 text-indigo-300 px-2.5 py-0.5 rounded-full font-mono text-[10px]"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {rule.source_text && (
                          <div className="col-span-2 border-t border-slate-800/40 pt-4">
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-2">
                              Source Regulatory Text
                            </div>
                            <p className="text-slate-350 leading-relaxed bg-slate-950/50 p-4 rounded-lg border border-slate-850 whitespace-pre-wrap font-sans">
                              {rule.source_text}
                            </p>
                          </div>
                        )}

                        <div className="col-span-2 flex items-center justify-between pt-4 border-t border-slate-800/40 mt-2 text-[10px] text-slate-500 font-mono">
                          <div>
                            Hash Lineage: <code className="text-slate-400 font-bold">{rule.content_hash}</code>
                          </div>
                          {rule.status === "pending_review" && (
                            <Link href="/review" className="text-indigo-400 hover:text-indigo-300 font-bold hover:underline btn-active-scale">
                              Open in Review Queue →
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
