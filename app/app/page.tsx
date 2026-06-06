import Link from "next/link";

interface RunSummary {
  run_id: string;
  started_at: string;
  standard: string;
  transactions_tested: number;
  violations: number;
  rules_applied: number;
}

async function getRuns(): Promise<RunSummary[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/runs`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function getRuleStats(): Promise<{ total: number; pending: number; approved: number }> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/rules/stats`,
      { cache: "no-store" }
    );
    if (!res.ok) return { total: 0, pending: 0, approved: 0 };
    return res.json();
  } catch {
    return { total: 0, pending: 0, approved: 0 };
  }
}

export default async function DashboardPage() {
  const [runs, ruleStats] = await Promise.all([getRuns(), getRuleStats()]);

  const totalTested = runs.reduce((s, r) => s + r.transactions_tested, 0);
  const totalViolations = runs.reduce((s, r) => s + r.violations, 0);

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-gray-900">AuditGraph</span>
          <span className="text-xs text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">
            Deterministic Audit Engine
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/rules" className="text-gray-500 hover:text-gray-900">Rule Library</Link>
          <Link href="/review" className="text-gray-500 hover:text-gray-900">Review Queue</Link>
          <Link
            href="/run/new"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-sm transition-colors"
          >
            New Audit Run
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Dashboard</h1>
        <p className="text-sm text-gray-500 mb-8">
          All transactions tested against 100% of applicable rules. Every result is traceable to a specific regulatory paragraph.
        </p>

        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard label="Rules Approved" value={ruleStats.approved} />
          <StatCard label="Pending Review" value={ruleStats.pending} accent="yellow" href="/review" />
          <StatCard label="Transactions Tested" value={totalTested.toLocaleString()} />
          <StatCard
            label="Violations Found"
            value={totalViolations.toLocaleString()}
            accent={totalViolations > 0 ? "red" : "green"}
          />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">Recent Audit Runs</h2>
            <Link href="/run/new" className="text-xs text-indigo-600 hover:text-indigo-800">
              Start new run
            </Link>
          </div>
          {runs.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              No audit runs yet.{" "}
              <Link href="/review" className="text-indigo-600 underline">
                Review pending rules
              </Link>{" "}
              first, then start a run.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Run ID</th>
                  <th className="text-left px-5 py-3">Standard</th>
                  <th className="text-left px-5 py-3">Date</th>
                  <th className="text-right px-5 py-3">Transactions</th>
                  <th className="text-right px-5 py-3">Rules</th>
                  <th className="text-right px-5 py-3">Violations</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.run_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">
                      {run.run_id.slice(0, 8)}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{run.standard}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {new Date(run.started_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      {run.transactions_tested.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">{run.rules_applied}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-medium ${run.violations > 0 ? "text-red-600" : "text-green-600"}`}>
                        {run.violations}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/trace/${run.run_id}`}
                        className="text-xs text-indigo-500 hover:text-indigo-700 underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  accent,
  href,
}: {
  label: string;
  value: string | number;
  accent?: "red" | "green" | "yellow";
  href?: string;
}) {
  const colors: Record<string, string> = {
    red: "text-red-600",
    green: "text-green-600",
    yellow: "text-yellow-600",
  };
  const card = (
    <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${accent ? colors[accent] : "text-gray-900"}`}>
        {value}
      </div>
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}
