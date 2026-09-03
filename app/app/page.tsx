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
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden">
      {/* Dynamic Background Glowing Auras */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />

      {/* Navigation */}
      <nav className="border-b border-slate-905 bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
            AuditGraph
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500 border border-slate-900 px-2 py-0.5 rounded-full font-mono">
            Deterministic Engine
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/rules" className="text-slate-400 hover:text-slate-200 transition-colors btn-active-scale">Rule Library</Link>
          <Link href="/review" className="text-slate-400 hover:text-slate-200 transition-colors btn-active-scale">Review Queue</Link>
          <Link
            href="/run/new"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-lg text-xs shadow-lg shadow-indigo-500/10 btn-active-scale inline-block"
          >
            New Audit Run
          </Link>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 flex flex-col gap-8 z-10">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Transaction compliance checks mapping 100% trace lineage back to regulation guidelines.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-5">
          <StatCard label="Rules Approved" value={ruleStats.approved} />
          <StatCard label="Pending Review" value={ruleStats.pending} accent="yellow" href="/review" />
          <StatCard label="Transactions Tested" value={totalTested.toLocaleString()} />
          <StatCard
            label="Violations Found"
            value={totalViolations.toLocaleString()}
            accent={totalViolations > 0 ? "red" : "green"}
          />
        </div>

        {/* Audit Runs Table */}
        <div className="bg-slate-900/50 backdrop-blur-md rounded-xl border border-slate-800/80 overflow-hidden shadow-2xl">
          <div className="px-6 py-5 border-b border-slate-800/60 flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Recent Audit Runs</h2>
            <Link href="/run/new" className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 btn-active-scale">
              Start new run →
            </Link>
          </div>
          {runs.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">
              No audit runs executed yet.{" "}
              <Link href="/review" className="text-indigo-400 hover:underline btn-active-scale">
                Review pending rules
              </Link>{" "}
              first, then trigger a run.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/60 text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                    <th className="px-6 py-3.5">Run ID</th>
                    <th className="px-6 py-3.5">Standard</th>
                    <th className="px-6 py-3.5">Execution Date</th>
                    <th className="px-6 py-3.5 text-right">Transactions</th>
                    <th className="px-6 py-3.5 text-right">Rules Applied</th>
                    <th className="px-6 py-3.5 text-right">Violations</th>
                    <th className="px-6 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {runs.map((run) => (
                    <tr key={run.run_id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        {run.run_id.slice(0, 8)}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-200">{run.standard}</td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {new Date(run.started_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-300">
                        {run.transactions_tested.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-slate-300">{run.rules_applied}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-mono font-bold text-xs px-2.5 py-1 rounded-full ${
                          run.violations > 0 ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}>
                          {run.violations > 0 ? `${run.violations} Violations` : "Clean"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/trace/${run.run_id}`}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold hover:underline btn-active-scale inline-block"
                        >
                          View Trace
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
  const card = (
    <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800/80 rounded-xl px-5 py-4 shadow-xl card-hover-glow relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider font-mono mb-1">{label}</div>
      <div className={`text-2xl font-black ${
        accent === "red" 
          ? "text-rose-400 font-mono" 
          : accent === "green" 
          ? "text-emerald-400 font-mono" 
          : accent === "yellow" 
          ? "text-amber-400 font-mono" 
          : "text-white"
      }`}>
        {value}
      </div>
    </div>
  );
  return href ? <Link href={href} className="btn-active-scale">{card}</Link> : card;
}
