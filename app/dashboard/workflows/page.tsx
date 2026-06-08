import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function WorkflowsPage() {
  const supabase = createClient();

  const [{ data: templates }, { data: runs }] = await Promise.all([
    supabase
      .from('workflow_templates')
      .select('id, name, key, description, is_active, job_types(name)')
      .order('name'),
    supabase
      .from('workflow_runs')
      .select('id, name, status, created_at, jobs(title)')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Workflows</h1>
        <p className="text-sm text-slate-600">
          Reusable templates and the runs executing them on jobs.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Templates</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(templates ?? []).map((t: any) => (
            <div key={t.id} className="card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ocean-900">{t.name}</h3>
                <span className="pill bg-slate-100 text-slate-600">
                  {t.is_active ? 'active' : 'inactive'}
                </span>
              </div>
              <div className="text-xs text-slate-500">{t.job_types?.name ?? 'Any job type'}</div>
              {t.description && <p className="mt-2 text-sm text-slate-600">{t.description}</p>}
            </div>
          ))}
          {(templates ?? []).length === 0 && (
            <div className="card p-6 text-sm text-slate-500">
              No workflow templates seeded yet.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Recent runs</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="table-head px-4 py-3">Run</th>
                <th className="table-head px-4 py-3">Job</th>
                <th className="table-head px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(runs ?? []).map((r: any) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.name ?? 'Workflow run'}</td>
                  <td className="px-4 py-3 text-slate-700">{r.jobs?.title ?? '—'}</td>
                  <td className="px-4 py-3 capitalize">{r.status?.replace(/_/g, ' ')}</td>
                </tr>
              ))}
              {(runs ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                    No workflow runs yet.
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
