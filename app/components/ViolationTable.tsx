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
      <div className="text-center py-12 text-gray-400 text-sm">
        No violations found — all transactions passed.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Transaction
            </th>
            <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Rule
            </th>
            <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Section
            </th>
            <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Violation
            </th>
            <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Time
            </th>
            <th className="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Trace
            </th>
          </tr>
        </thead>
        <tbody>
          {violations.map((v, i) => (
            <tr
              key={`${v.transaction_id}-${v.rule_id}-${i}`}
              className="border-b border-gray-100 hover:bg-red-50 transition-colors"
            >
              <td className="py-2 px-3 font-mono text-xs text-gray-700">
                {v.transaction_id}
              </td>
              <td className="py-2 px-3 font-mono text-xs text-indigo-600">
                {v.rule_id}
              </td>
              <td className="py-2 px-3 text-xs text-gray-500">
                {v.rule_section}
              </td>
              <td className="py-2 px-3 text-xs text-red-600 max-w-xs truncate" title={v.violation_message}>
                {v.violation_message ?? "—"}
              </td>
              <td className="py-2 px-3 text-xs text-gray-400">
                {new Date(v.timestamp).toLocaleTimeString()}
              </td>
              <td className="py-2 px-3">
                <Link
                  href={`/trace/${runId}?tx=${v.transaction_id}`}
                  className="text-xs text-indigo-500 hover:text-indigo-700 underline"
                >
                  View trace
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-xs text-gray-400 px-3">
        {violations.length} violation{violations.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
