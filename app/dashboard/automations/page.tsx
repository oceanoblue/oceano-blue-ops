import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AutomationsPage() {
  const supabase = createClient();

  const [{ data: scenarios }, { data: runs }] = await Promise.all([
    supabase
      .from('automation_scenarios')
      .select('id, name, provider, status, is_active')
      .order('name'),
    supabase
      .from('tool_runs')
      .select('id, tool_type, provider, status, created_at')
      .eq('tool_type', 'make_scenario')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Automations</h1>
        <p className="text-sm text-slate-600">
          Make.com scenarios and other automation runtimes. Runs are tracked as tool runs.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Scenarios</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="table-head px-4 py-3">Scenario</th>
                <th className="table-head px-4 py-3">Provider</th>
                <th className="table-head px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(scenarios ?? []).map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                  <td className="px-4 py-3 capitalize text-slate-700">{s.provider}</td>
                  <td className="px-4 py-3 capitalize">{s.status?.replace(/_/g, ' ')}</td>
                </tr>
              ))}
              {(scenarios ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                    No automation scenarios registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Recent scenario runs</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="table-head px-4 py-3">Provider</th>
                <th className="table-head px-4 py-3">Status</th>
                <th className="table-head px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(runs ?? []).map((r: any) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{r.provider ?? r.tool_type}</td>
                  <td className="px-4 py-3 capitalize">{r.status?.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {(runs ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                    No scenario runs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
