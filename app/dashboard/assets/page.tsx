import { Boxes } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';

export const dynamic = 'force-dynamic';

const COLUMNS: Column<any>[] = [
  { key: 'file', header: 'File', className: 'font-medium text-slate-800', cell: (a) => a.filename ?? a.id },
  { key: 'job', header: 'Job', className: 'text-slate-700', cell: (a) => a.jobs?.title ?? '—' },
  { key: 'media', header: 'Media', className: 'capitalize text-slate-700', cell: (a) => a.media_type },
  { key: 'type', header: 'Type', className: 'capitalize text-slate-700', cell: (a) => a.asset_type?.replace(/_/g, ' ') ?? '—' },
  { key: 'status', header: 'Status', cell: (a) => <StatusBadge status={a.status} /> },
];

export default async function AssetsPage() {
  const supabase = createClient();
  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, filename, media_type, asset_type, status, jobs(title)')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        subtitle="Universal media records — files stay on local/NAS/cloud; this is the index."
      />
      <DataTable
        columns={COLUMNS}
        rows={assets ?? []}
        rowKey={(a) => a.id}
        empty={
          <EmptyState
            icon={Boxes}
            title="No assets registered yet"
            description="Media indexed from local, NAS, and cloud storage will be listed here."
          />
        }
        error={error?.message ?? null}
      />
    </div>
  );
}
