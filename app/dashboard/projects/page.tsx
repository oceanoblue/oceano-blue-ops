import { FolderKanban } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';

export const dynamic = 'force-dynamic';

const COLUMNS: Column<any>[] = [
  { key: 'name', header: 'Project', className: 'font-medium text-ocean-800', cell: (p) => p.name },
  { key: 'client', header: 'Client', className: 'text-slate-700', cell: (p) => p.clients?.full_name ?? '—' },
  { key: 'jobs', header: 'Jobs', className: 'text-slate-700', cell: (p) => p.jobs?.[0]?.count ?? 0 },
  { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
  {
    key: 'due',
    header: 'Due',
    className: 'text-slate-700',
    cell: (p) => (p.due_date ? new Date(p.due_date).toLocaleDateString() : '—'),
  },
];

export default async function ProjectsPage() {
  const supabase = createClient();
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, status, due_date, language, clients(full_name), jobs(count)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" subtitle="Client initiatives that group related jobs." />
      <DataTable
        columns={COLUMNS}
        rows={projects ?? []}
        rowKey={(p) => p.id}
        empty={
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Group related jobs into a client project to track them together."
          />
        }
        error={error?.message ?? null}
      />
    </div>
  );
}
