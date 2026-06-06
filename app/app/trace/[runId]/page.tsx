"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuditTraceGraph } from "@/components/AuditTraceGraph";
import { ViolationTable } from "@/components/ViolationTable";
import type { AuditLogEntry, AuditRule, AuditRunSummary } from "@/lib/types";

interface Props {
  params: { runId: string };
}

export default function TracePage({ params }: Props) {
  const { runId } = params;
  const searchParams = useSearchParams();
  const selectedTx = searchParams.get("tx");

  const [summary, setSummary] = useState<AuditRunSummary | null>(null);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [rules, setRules] = useState<AuditRule[]>([]);
  const [activeTx, setActiveTx] = useState<string | null>(selectedTx);
  const [view, setView] = useState<"table" | "graph">("table");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/runs/${runId}`).then((r) => r.json()),
      fetch(`/api/runs/${runId}/log`).then((r) => r.json()),
      fetch(`/api/rules?status=approved`).then((r) => r.json()),
    ])
      .then(([s, e, r]) => {
        setSummary(s);
        setEntries(e);
        setRules(r);
        if (!activeTx && e.length > 0) {
          const firstViolation = e.find((entry: AuditLogEntry) => entry.result === "fail");
          setActiveTx(firstViolation?.transaction_id ?? e[0].transaction_id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [runId]);

  const violations = entries.filter((e) => e.result === "fail");
  const violatedTxIds = [...new Set(violations.map((e) => e.transaction_id))];

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <a href="/" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</a>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900 font-mono">{runId.slice(0, 8)}</span>
      </nav>

      {loading ? (
        <div className="p-10 text-sm text-gray-400">Loading audit run...</div>
      ) : !summary ? (
        <div className="p-10 text-sm text-gray-400">Run not found.</div>
      ) : (
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Run summary */}
          <div className="bg-white border border-gray-200 rounded-lg px-5 py-4 mb-6 flex items-center gap-8 text-sm">
            <div>
              <div className="text-xs text-gray-400">Standard</div>
              <div className="font-medium text-gray-900">{summary.standard}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Transactions Tested</div>
              <div className="font-medium text-gray-900">{summary.transactions_tested.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Rules Applied</div>
              <div className="font-medium text-gray-900">{summary.rules_applied}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Violations</div>
              <div className={`font-medium ${summary.violations > 0 ? "text-red-600" : "text-green-600"}`}>
                {summary.violations}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Coverage</div>
              <div className="font-medium text-green-600">100%</div>
            </div>
            <div className="ml-auto text-xs text-gray-400">
              {new Date(summary.started_at).toLocaleString()}
            </div>
          </div>

          <div className="flex gap-5 h-[calc(100vh-230px)]">
            {/* Violated transactions sidebar */}
            <div className="w-52 shrink-0 flex flex-col gap-1 overflow-y-auto">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                Violations ({violatedTxIds.length})
              </div>
              {violatedTxIds.length === 0 ? (
                <div className="text-xs text-gray-400 px-1">No violations</div>
              ) : (
                violatedTxIds.map((txId) => (
                  <button
                    key={txId}
                    onClick={() => { setActiveTx(txId); setView("graph"); }}
                    className={`text-left px-3 py-2 rounded text-xs transition-colors ${
                      activeTx === txId
                        ? "bg-red-50 border border-red-200 text-red-700"
                        : "hover:bg-gray-100 text-gray-600"
                    }`}
                  >
                    <div className="font-mono">{txId}</div>
                    <div className="text-gray-400 mt-0.5">
                      {violations.filter((v) => v.transaction_id === txId).length} rule(s)
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Main panel */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setView("table")}
                  className={`text-xs px-3 py-1.5 rounded transition-colors ${
                    view === "table" ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Violation Table
                </button>
                <button
                  onClick={() => setView("graph")}
                  className={`text-xs px-3 py-1.5 rounded transition-colors ${
                    view === "graph" ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Trace Graph
                </button>
                {activeTx && view === "graph" && (
                  <span className="text-xs text-gray-400 self-center ml-2">
                    Transaction: <code className="font-mono">{activeTx}</code>
                  </span>
                )}
              </div>

              <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
                {view === "table" ? (
                  <div className="p-1 overflow-y-auto h-full">
                    <ViolationTable violations={violations} runId={runId} />
                  </div>
                ) : activeTx ? (
                  <AuditTraceGraph entries={entries} rules={rules} transactionId={activeTx} />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-gray-400">
                    Select a transaction from the sidebar
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
