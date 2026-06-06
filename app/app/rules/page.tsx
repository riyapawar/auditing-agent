"use client";

import { useEffect, useState } from "react";
import type { AuditRule, RuleStatus } from "@/lib/types";

const STATUS_LABELS: Record<RuleStatus, string> = {
  pending_review: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<RuleStatus, string> = {
  pending_review: "bg-yellow-50 text-yellow-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
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
      .then((d) => { setRules(d); setLoading(false); })
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
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <a href="/" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</a>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900">Rule Library</span>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Rule Library</h1>
          <a
            href="/review"
            className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded transition-colors"
          >
            Review Queue
          </a>
        </div>

        <div className="flex gap-3 mb-5">
          <input
            type="text"
            placeholder="Search rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as RuleStatus | "all")}
            className="text-sm border border-gray-200 rounded px-3 py-2 bg-white"
          >
            <option value="all">All statuses</option>
            <option value="pending_review">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {loading ? (
          <div className="text-sm text-gray-400">Loading rules...</div>
        ) : visible.length === 0 ? (
          <div className="text-sm text-gray-400">No rules found.</div>
        ) : (
          <div className="space-y-2">
            {visible.map((rule) => (
              <div
                key={rule.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(expanded === rule.id ? null : rule.id)}
                  className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
                >
                  <code className="text-sm font-mono text-indigo-600 shrink-0">{rule.id}</code>
                  <span className="text-sm text-gray-700 flex-1 truncate">{rule.description}</span>
                  <span className="text-xs text-gray-400 shrink-0">{rule.section}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[rule.status]}`}>
                    {STATUS_LABELS[rule.status]}
                  </span>
                  <span className="text-gray-300 text-xs">{expanded === rule.id ? "▲" : "▼"}</span>
                </button>

                {expanded === rule.id && (
                  <div className="border-t border-gray-100 px-5 py-4 grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="text-gray-400 font-semibold uppercase tracking-wider mb-1">Condition</div>
                      <pre className="bg-gray-50 border border-gray-100 rounded p-2 overflow-x-auto text-gray-700">
                        {JSON.stringify(rule.condition, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-gray-400 font-semibold uppercase tracking-wider mb-1">Assertion</div>
                      <pre className="bg-gray-50 border border-gray-100 rounded p-2 overflow-x-auto text-gray-700">
                        {JSON.stringify(rule.assertion, null, 2)}
                      </pre>
                    </div>
                    {rule.applies_to.length > 0 && (
                      <div>
                        <div className="text-gray-400 font-semibold uppercase tracking-wider mb-1">Applies To</div>
                        <div className="flex flex-wrap gap-1">
                          {rule.applies_to.map((t) => (
                            <span key={t} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {rule.source_text && (
                      <div className="col-span-2">
                        <div className="text-gray-400 font-semibold uppercase tracking-wider mb-1">Source Text</div>
                        <p className="text-gray-600 leading-relaxed">{rule.source_text}</p>
                      </div>
                    )}
                    <div className="col-span-2 flex items-center justify-between pt-2 border-t border-gray-100">
                      <div className="text-gray-400">
                        Hash: <code className="font-mono">{rule.content_hash}</code>
                      </div>
                      {rule.status === "pending_review" && (
                        <a href="/review" className="text-indigo-600 hover:text-indigo-800 underline">
                          Review this rule
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
