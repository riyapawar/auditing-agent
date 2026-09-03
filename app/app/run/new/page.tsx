"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Transaction, AuditRunSummary } from "@/lib/types";

const RUN_STEPS = [
  "Resolving regulatory dependencies and sorting rules DAG...",
  "Parsing and validating transaction payloads...",
  "Evaluating conditions and executing deterministic assertions...",
  "Writing trace logs and serializing run summary...",
];

export default function NewRunPage() {
  const router = useRouter();
  const [presets, setPresets] = useState<Transaction[]>([]);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [customJson, setCustomJson] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [standard, setStandard] = useState("ASC 606");
  
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runStep, setRunStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<AuditRunSummary | null>(null);

  useEffect(() => {
    fetch("/api/transactions")
      .then((r) => r.json())
      .then((data) => {
        setPresets(data);
        // Select all by default
        setSelectedTxIds(new Set(data.map((tx: Transaction) => tx.id)));
        setCustomJson(JSON.stringify(data, null, 2));
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load preset transactions.");
        setLoading(false);
      });
  }, []);

  const handleToggleSelect = (id: string) => {
    const updated = new Set(selectedTxIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setSelectedTxIds(updated);
    
    // Also update JSON text if they toggle presets
    const filtered = presets.filter((p) => updated.has(p.id));
    setCustomJson(JSON.stringify(filtered, null, 2));
  };

  const handleSelectAll = () => {
    const allIds = presets.map((p) => p.id);
    setSelectedTxIds(new Set(allIds));
    setCustomJson(JSON.stringify(presets, null, 2));
  };

  const handleClearAll = () => {
    setSelectedTxIds(new Set());
    setCustomJson("[]");
  };

  const handleRunAudit = async () => {
    setError(null);
    let txPayload: Transaction[] = [];

    if (useCustom) {
      try {
        txPayload = JSON.parse(customJson);
        if (!Array.isArray(txPayload)) {
          throw new Error("Transactions must be a JSON array.");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Invalid JSON format for transactions.");
        return;
      }
    } else {
      txPayload = presets.filter((p) => selectedTxIds.has(p.id));
      if (txPayload.length === 0) {
        setError("Please select at least one transaction to audit.");
        return;
      }
    }

    setRunning(true);
    setRunStep(0);

    // Simulate steps for a beautiful demo/interactive experience
    for (let i = 0; i < RUN_STEPS.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setRunStep(i + 1);
    }

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: txPayload,
          standard,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Execution failed.");
      }

      setRunResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setRunning(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Premium Dark Nav */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
            AuditGraph
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500 border border-slate-800 px-2 py-0.5 rounded-full font-mono">
            Audit Suite
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-slate-400 hover:text-slate-200 transition-colors btn-active-scale">
            Dashboard
          </Link>
          <Link href="/rules" className="text-slate-400 hover:text-slate-200 transition-colors btn-active-scale">
            Rule Library
          </Link>
          <Link href="/review" className="text-slate-400 hover:text-slate-200 transition-colors btn-active-scale">
            Review Queue
          </Link>
        </div>
      </nav>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Configure Audit Run
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Choose accounting standards and transactions to verify compliance with complete lineage.
          </p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-lg text-sm">
            {error}
          </div>
        )}

        {running ? (
          /* Execution logger & Loading screen */
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center min-h-[400px] shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
            
            {!runResult ? (
              <div className="flex flex-col items-center gap-6 max-w-lg w-full">
                {/* Micro-animated pulsing spinner */}
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                </div>
                
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white">Running Audit Executor</h3>
                  <p className="text-xs text-slate-500 mt-1">Simulating regulatory compliance evaluations</p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                  <div 
                    className="bg-indigo-500 h-full transition-all duration-500 ease-out"
                    style={{ width: `${(runStep / RUN_STEPS.length) * 100}%` }}
                  />
                </div>

                {/* Step checklist */}
                <div className="w-full space-y-2 text-xs font-mono mt-4">
                  {RUN_STEPS.map((step, idx) => {
                    const isDone = runStep > idx;
                    const isActive = runStep === idx;
                    return (
                      <div 
                        key={idx} 
                        style={{ animationDelay: `${idx * 120}ms` }}
                        className={`flex items-center gap-3 transition-colors duration-300 animate-step-in ${
                          isDone ? "text-indigo-400" : isActive ? "text-cyan-400 font-bold" : "text-slate-655"
                        }`}
                      >
                        <span className="shrink-0">
                          {isDone ? "✓" : isActive ? "→" : "•"}
                        </span>
                        <span>{step}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Success results view */
              <div className="flex flex-col items-center gap-6 max-w-md w-full text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-2xl font-bold animate-bounce">
                  ✓
                </div>
                
                <div>
                  <h3 className="text-xl font-bold text-white">Audit Execution Complete</h3>
                  <p className="text-sm text-slate-400 mt-1">All rules tested with zero exceptions bypassed.</p>
                </div>

                {/* Summary Metrics */}
                <div className="grid grid-cols-3 gap-2 w-full mt-2">
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Tested</div>
                    <div className="text-lg font-bold text-white mt-0.5">{runResult.transactions_tested}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Rules</div>
                    <div className="text-lg font-bold text-indigo-400 mt-0.5">{runResult.rules_applied}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Violations</div>
                    <div className={`text-lg font-bold mt-0.5 ${runResult.violations > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                      {runResult.violations}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 w-full mt-4">
                  <button
                    onClick={() => router.push(`/trace/${runResult.run_id}`)}
                    className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-sm font-semibold py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/10 btn-active-scale transition-all"
                  >
                    Explore Audit Trace Graph
                  </button>
                  <button
                    onClick={() => {
                      setRunResult(null);
                      setRunning(false);
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold px-4 py-2.5 rounded-lg btn-active-scale transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Input Form & Config */
          <div className="grid grid-cols-3 gap-6">
            {/* Left Col: Config Panel */}
            <div className="col-span-1 flex flex-col gap-5 bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-lg">
              <h2 className="text-base font-bold text-white border-b border-slate-800 pb-2">
                Audit Configuration
              </h2>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Accounting Standard
                </label>
                <select
                  value={standard}
                  onChange={(e) => setStandard(e.target.value)}
                  className="w-full text-sm bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-all duration-200 focus:ring-1 focus:ring-indigo-500/20"
                >
                  <option value="ASC 606">ASC 606 (Revenue Recognition)</option>
                  <option value="IFRS 15">IFRS 15 (Contracts Revenue)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Transaction Source
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded border border-slate-800">
                  <button
                    onClick={() => setUseCustom(false)}
                    className={`text-xs py-1.5 rounded transition-all btn-active-scale font-medium ${
                      !useCustom ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Presets Selection
                  </button>
                  <button
                    onClick={() => setUseCustom(true)}
                    className={`text-xs py-1.5 rounded transition-all btn-active-scale font-medium ${
                      useCustom ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Custom JSON Editor
                  </button>
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-800">
                <button
                  onClick={handleRunAudit}
                  className="w-full bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white font-semibold py-2.5 rounded-lg text-sm shadow-lg shadow-indigo-500/10 btn-active-scale transition-all flex items-center justify-center gap-2"
                >
                  Run Compliance Audit
                </button>
              </div>
            </div>

            {/* Right Col: Transaction Selector or JSON Editor */}
            <div className="col-span-2 bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col min-h-[480px]">
              {!useCustom ? (
                /* Presets selection card list */
                <div className="flex-1 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <h2 className="text-base font-bold text-white">Preset Transaction Profiles</h2>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleSelectAll}
                        className="text-[10px] text-indigo-400 hover:underline btn-active-scale"
                      >
                        Select All
                      </button>
                      <span className="text-[10px] text-slate-700">|</span>
                      <button 
                        onClick={handleClearAll}
                        className="text-[10px] text-indigo-400 hover:underline btn-active-scale"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
                      Loading preset transaction records...
                    </div>
                  ) : presets.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
                      No presets found.
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[360px]">
                      {presets.map((tx) => {
                        const isSelected = selectedTxIds.has(tx.id);
                        return (
                          <div
                            key={tx.id}
                            onClick={() => handleToggleSelect(tx.id)}
                            className={`border rounded-lg p-3 flex justify-between items-center cursor-pointer transition-all duration-200 btn-active-scale ${
                              isSelected
                                ? "bg-slate-900 border-indigo-500/50 shadow-md shadow-indigo-500/5"
                                : "bg-slate-950 border-slate-800 hover:border-slate-700"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                className="rounded text-indigo-500 border-slate-700 focus:ring-0 focus:ring-offset-0 bg-slate-900"
                              />
                              <div>
                                <code className="text-xs font-mono font-bold text-indigo-400">{tx.id}</code>
                                <div className="text-[10px] text-slate-500 uppercase mt-0.5 font-semibold">
                                  {tx.type.replace("_", " ")}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-mono text-slate-400">
                                {tx.date}
                              </span>
                              <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[200px]">
                                {Object.keys(tx.fields).length} field values
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* Custom JSON editor */
                <div className="flex-1 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <h2 className="text-base font-bold text-white">Custom JSON Transactions</h2>
                    <span className="text-[10px] text-slate-500 font-mono">JSON Array</span>
                  </div>

                  <textarea
                    value={customJson}
                    onChange={(e) => setCustomJson(e.target.value)}
                    className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-indigo-300 focus:outline-none focus:border-indigo-500 transition-all duration-200 focus:ring-1 focus:ring-indigo-500/20 resize-none min-h-[300px]"
                    placeholder="[ { 'id': 'TX-001', 'type': 'license', 'fields': { ... } } ]"
                  />
                  <div className="text-[10px] text-slate-500">
                    Format: Must be a JSON array of transaction objects containing `id`, `date`, `type`, and `fields`.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
