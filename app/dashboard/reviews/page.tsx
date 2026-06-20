import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const dynamic = 'force-dynamic';

const COLUMNS: Column<any>[] = [
  { key: 'title', header: 'Title', className: 'font-medium text-slate-800', cell: (r) => r.title ?? 'Review' },
  { key: 'job', header: 'Job', className: 'text-slate-700', cell: (r) => r.jobs?.title ?? '—' },
  { key: 'provider', header: 'Provider', className: 'capitalize text-slate-700', cell: (r) => r.provider ?? '—' },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  {
    key: 'link',
    header: 'Link',
    cell: (r) =>
      r.external_url ? (
        <a href={r.external_url} className="text-ocean-700 hover:underline" target="_blank" rel="noreferrer">
          Open →
        </a>
      ) : (
        '—'
      ),
  },
];

export default async function ReviewsPage() {
  const supabase = createClient();
  const { data: reviews, error } = await supabase
    .from('review_sessions')
    .select('id, title, provider, status, external_url, created_at, jobs(title)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews"
        subtitle="Review sessions across Frame.io, Vimeo, Pixieset, and internal review."
      />
      <DataTable
        columns={COLUMNS}
        rows={reviews ?? []}
        rowKey={(r) => r.id}
        empty="No review sessions yet."
        error={error?.message ?? null}
      />
    </div>
  );
}
