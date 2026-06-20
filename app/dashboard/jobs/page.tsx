import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const dynamic = 'force-dynamic';

const COLUMNS: Column<any>[] = [
  { key: 'num', header: '#', className: 'text-slate-500', cell: (j) => `#${j.job_number}` },
  { key: 'title', header: 'Title', className: 'font-medium text-ocean-800', cell: (j) => j.title },
  { key: 'type', header: 'Type', className: 'text-slate-700', cell: (j) => j.job_types?.name ?? '—' },
  { key: 'client', header: 'Client', className: 'text-slate-700', cell: (j) => j.clients?.full_name ?? '—' },
  { key: 'project', header: 'Project', className: 'text-slate-700', cell: (j) => j.projects?.name ?? '—' },
  { key: 'status', header: 'Status', cell: (j) => <StatusBadge status={j.status} /> },
  {
    key: 'due',
    header: 'Due',
    className: 'text-slate-700',
    cell: (j) => (j.due_date ? new Date(j.due_date).toLocaleDateString() : '—'),
  },
];

export default async function JobsPage() {
  const supabase = createClient();
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select(
      'id, job_number, title, status, priority, due_date, clients(full_name), projects(name), job_types(name)'
    )
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <PageHeader title="Jobs" subtitle="The main production unit across every job type." />
      <DataTable
        columns={COLUMNS}
        rows={jobs ?? []}
        rowKey={(j) => j.id}
        rowHref={(j) => `/dashboard/jobs/${j.id}`}
        empty="No jobs yet."
        error={error?.message ?? null}
      />
    </div>
  );
}
