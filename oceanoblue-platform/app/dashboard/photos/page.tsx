import { createClient } from '@/lib/supabase/server';
import { fmtRelative, fmtCents } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function PhotosOverviewPage() {
  const supabase = createClient();

  const { data: recentJobs } = await supabase
    .from('ai_jobs')
    .select('id, order_id, job_type, provider, model, status, cost_cents, duration_ms, created_at, completed_at, error_message')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: counts } = await supabase
    .from('ai_jobs')
    .select('status, cost_cents');

  let totalCost = 0;
  const byStatus: Record<string, number> = {};
  (counts ?? []).forEach((j: any) => {
    totalCost += j.cost_cents ?? 0;
    byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Photo processing</h1>
        <p className="text-sm text-slate-600">All AI jobs across all orders.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Total spent" value={fmtCents(totalCost)} />
        <Stat label="Pending" value={byStatus.pending ?? 0} />
        <Stat label="Running" value={byStatus.running ?? 0} />
        <Stat label="Complete" value={byStatus.complete ?? 0} />
        <Stat label="Failed" value={byStatus.failed ?? 0} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head px-4 py-3">Job</th>
              <th className="table-head px-4 py-3">Provider</th>
              <th className="table-head px-4 py-3">Status</th>
              <th className="table-head px-4 py-3">Cost</th>
              <th className="table-head px-4 py-3">Duration</th>
              <th className="table-head px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(recentJobs ?? []).map((j: any) => (
              <tr key={j.id}>
                <td className="px-4 py-3 font-medium">{j.job_type}</td>
                <td className="px-4 py-3 text-slate-700">{j.model ?? j.provider}</td>
                <td className="px-4 py-3 capitalize">{j.status}</td>
                <td className="px-4 py-3">{fmtCents(j.cost_cents)}</td>
                <td className="px-4 py-3">{j.duration_ms ? `${(j.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                <td className="px-4 py-3 text-slate-500">{fmtRelative(j.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-ocean-900">{value}</div>
    </div>
  );
}
