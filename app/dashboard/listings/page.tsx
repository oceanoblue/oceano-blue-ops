import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtAddress } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const dynamic = 'force-dynamic';

const COLUMNS: Column<any>[] = [
  { key: 'address', header: 'Address', cell: (l) => <span className="text-ocean-800">{fmtAddress(l)}</span> },
  {
    key: 'client',
    header: 'Client',
    className: 'text-slate-700',
    cell: (l) => (
      <>
        <div>{l.clients?.full_name ?? '—'}</div>
        <div className="text-xs text-slate-500">{l.clients?.brokerage ?? ''}</div>
      </>
    ),
  },
  { key: 'beds', header: 'Beds / Baths', cell: (l) => `${l.bedrooms ?? '—'} / ${l.bathrooms ?? '—'}` },
  { key: 'sqft', header: 'Sq ft', cell: (l) => l.sqft?.toLocaleString() ?? '—' },
  { key: 'status', header: 'Status', cell: (l) => <StatusBadge status={l.status} /> },
];

export default async function ListingsPage() {
  const supabase = createClient();
  const { data: listings, error } = await supabase
    .from('listings')
    .select('id, address_line1, city, state, zip, bedrooms, bathrooms, sqft, status, clients(full_name, brokerage)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader title="Listings" subtitle="Every property the team has photographed or scheduled.">
        <Link href="/dashboard/listings/new" className="btn-primary">New listing</Link>
      </PageHeader>

      <DataTable
        columns={COLUMNS}
        rows={listings ?? []}
        rowKey={(l) => l.id}
        rowHref={(l) => `/dashboard/listings/${l.id}`}
        empty="No listings yet."
        error={error?.message ?? null}
      />
    </div>
  );
}
