"use client";

import Link from "next/link";
import type { AuditLogEntry } from "@/lib/types";

interface Props {
  violations: AuditLogEntry[];
  runId: string;
}

export function ViolationTable({ violations, runId }: Props) {
  if (violations.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        No violations found — all transactions passed.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider font-mono">
            <th className="py-3 px-4">Transaction</th>
            <th className="py-3 px-4">Rule</th>
            <th className="py-3 px-4">Section</th>
            <th className="py-3 px-4">Violation</th>
            <th className="py-3 px-4">Time</th>
            <th className="py-3 px-4">Trace</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/40">
          {violations.map((v, i) => (
            <tr
              key={`${v.transaction_id}-${v.rule_id}-${i}`}
              className="hover:bg-slate-900/40 transition-colors"
            >
              <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                {v.transaction_id}
              </td>
              <td className="py-3.5 px-4 font-mono text-xs text-indigo-400 font-semibold">
                {v.rule_id}
              </td>
              <td className="py-3.5 px-4 text-xs text-slate-550 font-mono">
                § {v.rule_section}
              </td>
              <td className="py-3.5 px-4 text-xs text-rose-400 max-w-xs truncate" title={v.violation_message}>
                {v.violation_message ?? "—"}
              </td>
              <td className="py-3.5 px-4 text-xs text-slate-500 font-mono">
                {new Date(v.timestamp).toLocaleTimeString()}
              </td>
              <td className="py-3.5 px-4 font-mono text-xs">
                <Link
                  href={`/trace/${runId}?tx=${v.transaction_id}`}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold hover:underline btn-active-scale inline-block"
                >
                  View trace
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 text-xs text-slate-500 px-4 font-mono">
        {violations.length} violation{violations.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
