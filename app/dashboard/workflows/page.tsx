import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const dynamic = 'force-dynamic';

const RUN_COLUMNS: Column<any>[] = [
  { key: 'run', header: 'Run', className: 'font-medium text-slate-800', cell: (r) => r.name ?? 'Workflow run' },
  { key: 'job', header: 'Job', className: 'text-slate-700', cell: (r) => r.jobs?.title ?? '—' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

export default async function WorkflowsPage() {
  const supabase = createClient();

  const [{ data: templates }, { data: runs, error: runsError }] = await Promise.all([
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
      <PageHeader title="Workflows" subtitle="Reusable templates and the runs executing them on jobs." />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Templates</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(templates ?? []).map((t: any) => (
            <div key={t.id} className="card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ocean-900">{t.name}</h3>
                <StatusBadge status={t.is_active ? 'active' : 'inactive'} />
              </div>
              <div className="text-xs text-slate-500">{t.job_types?.name ?? 'Any job type'}</div>
              {t.description && <p className="mt-2 text-sm text-slate-600">{t.description}</p>}
            </div>
          ))}
          {(templates ?? []).length === 0 && (
            <div className="card p-6 text-sm text-slate-500">No workflow templates seeded yet.</div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Recent runs</h2>
        <DataTable
          columns={RUN_COLUMNS}
          rows={runs ?? []}
          rowKey={(r) => r.id}
          empty="No workflow runs yet."
          error={runsError?.message ?? null}
        />
      </section>
    </div>
  );
}
