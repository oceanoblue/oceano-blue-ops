import { fmtDate } from '@/lib/utils/format';
import { FolderKanban } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import Link from 'next/link';
import { PROJECT_PAGE_SIZE, projectFilters, projectListHref, projectPage } from '@/lib/projects/list';

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
    cell: (p) => fmtDate(p.due_date),
  },
];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const filters = projectFilters(await searchParams);
  const { data: projects, error, count } = await projectPage(supabase, filters);
  const pages = Math.max(1, Math.ceil(count / PROJECT_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" subtitle="Client initiatives that group related jobs." />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Project view" className="flex flex-wrap gap-2">
          {([{ value: 'current', label: 'Current projects' }, { value: 'archived', label: 'Archived' }, { value: 'all', label: 'All projects' }] as const).map(view => (
            <Link key={view.value} href={projectListHref({ ...filters, view: view.value, page: 0 })} aria-current={filters.view === view.value ? 'page' : undefined}
              className={filters.view === view.value ? 'btn-primary' : 'btn-secondary'}>{view.label}</Link>
          ))}
        </nav>
        <form className="flex w-full gap-2 sm:w-auto" action="/dashboard/projects" method="get">
          <input type="hidden" name="view" value={filters.view} />
          <input className="input min-w-0 sm:w-64" name="q" defaultValue={filters.query} maxLength={120} aria-label="Search projects" placeholder="Search project names" />
          <button className="btn-secondary">Search</button>
        </form>
      </div>
      {!error && <p className="text-sm text-slate-500">{count.toLocaleString()} matching {count === 1 ? 'project' : 'projects'}{filters.view === 'current' ? ' · Archived history is kept in the Archived view.' : ''}</p>}
      <DataTable
        columns={COLUMNS}
        rows={projects ?? []}
        rowKey={(p) => p.id}
        empty={
          <EmptyState
            icon={FolderKanban}
            title="No matching projects"
            description="Choose another view or clear the search to see more projects."
          />
        }
        error={error ? 'Projects could not be loaded. Refresh and try again.' : null}
      />
      {!error && <nav aria-label="Project pages" className="flex items-center justify-between gap-3 text-sm">
        {filters.page > 0 ? <Link className="btn-secondary" href={projectListHref({ ...filters, page: filters.page - 1 })}>Previous</Link> : <span className="btn-secondary opacity-50" aria-disabled="true">Previous</span>}
        <span className="text-slate-500">Page {filters.page + 1} of {pages}</span>
        {(filters.page + 1) * PROJECT_PAGE_SIZE < count ? <Link className="btn-secondary" href={projectListHref({ ...filters, page: filters.page + 1 })}>Next</Link> : <span className="btn-secondary opacity-50" aria-disabled="true">Next</span>}
      </nav>}
    </div>
  );
}
