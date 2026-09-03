"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import { AuditTraceGraph } from "@/components/AuditTraceGraph";
import { ViolationTable } from "@/components/ViolationTable";
import type { AuditLogEntry, AuditRule, AuditRunSummary } from "@/lib/types";
import Link from "next/link";

interface Props {
  params: Promise<{ runId: string }>;
}

export default function TracePage({ params }: Props) {
  const { runId } = use(params);
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
      fetch(`/api/runs/${runId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/runs/${runId}/log`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/rules?status=approved`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([s, e, r]) => {
        setSummary(s);
        setEntries(e || []);
        setRules(r || []);
        if (!activeTx && e && e.length > 0) {
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
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden">
      {/* Background Blurs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />

      {/* Nav */}
      <nav className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400 btn-active-scale">
            AuditGraph
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-sm font-medium text-slate-200">Execution Trace</span>
          <span className="text-slate-600">/</span>
          <span className="text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
            {runId.slice(0, 8)}
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-slate-400 hover:text-slate-200 transition-colors btn-active-scale">Dashboard</Link>
          <Link href="/rules" className="text-slate-400 hover:text-slate-200 transition-colors btn-active-scale">Rule Library</Link>
          <Link href="/review" className="text-slate-400 hover:text-slate-200 transition-colors btn-active-scale">Review Queue</Link>
          <Link
            href="/run/new"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-lg text-xs shadow-lg shadow-indigo-500/10 btn-active-scale transition-all"
          >
            New Audit Run
          </Link>
        </div>
      </nav>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-slate-800 border-t-indigo-500 animate-spin" />
            <span className="font-mono text-xs">Loading execution traces...</span>
          </div>
        </div>
      ) : !summary || "error" in summary ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          Execution summary run metadata not found.
        </div>
      ) : (
        <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 flex flex-col gap-6 z-10">
          {/* Run summary */}
          <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800/80 rounded-xl px-5 py-4 flex items-center gap-8 text-xs shadow-xl">
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-0.5">Standard</div>
              <div className="font-semibold text-slate-200">{summary.standard}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-0.5">Transactions Tested</div>
              <div className="font-semibold text-slate-200">{summary.transactions_tested.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-0.5">Rules Applied</div>
              <div className="font-semibold text-indigo-400 font-mono">{summary.rules_applied}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-0.5">Violations</div>
              <div className={`font-mono font-bold px-2.5 py-0.5 rounded-full text-[10px] border ${
                summary.violations > 0 
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20" 
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              }`}>
                {summary.violations > 0 ? `${summary.violations} Violations` : "Clean"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono mb-0.5">Coverage</div>
              <div className="font-semibold text-emerald-400">100%</div>
            </div>
            <div className="ml-auto text-[10px] text-slate-500 font-mono">
              Executed: {new Date(summary.started_at).toLocaleString()}
            </div>
          </div>

          <div className="flex gap-5 h-[calc(100vh-230px)]">
            {/* Violated transactions sidebar */}
            <div className="w-56 shrink-0 flex flex-col gap-2 overflow-y-auto pr-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono px-1">
                Violating Transactions ({violatedTxIds.length})
              </div>
              {violatedTxIds.length === 0 ? (
                <div className="text-xs text-slate-500 px-1 border border-dashed border-slate-900 p-4 rounded-lg">
                  No violations. All tests passed.
                </div>
              ) : (
                violatedTxIds.map((txId) => (
                  <button
                    key={txId}
                    onClick={() => { setActiveTx(txId); setView("graph"); }}
                    className={`text-left px-4 py-3 rounded-lg border text-xs transition-all cursor-pointer btn-active-scale relative overflow-hidden ${
                      activeTx === txId
                        ? "bg-rose-950/20 border-rose-500/30 text-rose-300 shadow-md shadow-rose-500/5"
                        : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700/60 text-slate-400"
                    }`}
                  >
                    <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r bg-rose-500 transition-all duration-200 ${activeTx === txId ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50"}`} />
                    <div className="pl-2.5">
                      <div className="font-mono font-bold text-slate-200">{txId}</div>
                      <div className="text-[10px] text-slate-500 mt-1 font-mono">
                        {violations.filter((v) => v.transaction_id === txId).length} rule violation(s)
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Main panel */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex gap-2 mb-3 items-center">
                <button
                  onClick={() => setView("table")}
                  className={`text-xs px-4 py-2 rounded-lg font-semibold transition-all btn-active-scale ${
                    view === "table" 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/10" 
                      : "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300"
                  }`}
                >
                  Violation Table
                </button>
                <button
                  onClick={() => setView("graph")}
                  className={`text-xs px-4 py-2 rounded-lg font-semibold transition-all btn-active-scale ${
                    view === "graph" 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/10" 
                      : "bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300"
                  }`}
                >
                  Trace Graph
                </button>
                {activeTx && view === "graph" && (
                  <span className="text-xs text-slate-500 ml-2 font-mono">
                    Target Transaction: <code className="font-bold text-indigo-400">{activeTx}</code>
                  </span>
                )}
              </div>

              <div className="flex-1 bg-slate-900/50 backdrop-blur-md border border-slate-800/80 rounded-xl overflow-hidden shadow-2xl">
                {view === "table" ? (
                  <div className="p-1 overflow-y-auto h-full">
                    <ViolationTable violations={violations} runId={runId} />
                  </div>
                ) : activeTx ? (
                  <AuditTraceGraph entries={entries} rules={rules} transactionId={activeTx} />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-slate-500">
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
