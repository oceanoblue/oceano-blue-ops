import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL, fmtDateTime, fmtAddress } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';

export const dynamic = 'force-dynamic';

const COLUMNS: Column<any>[] = [
  {
    key: 'order',
    header: 'Order',
    cell: (o) => (
      <>
        <span className="font-medium text-ocean-800">#{o.order_number}</span>
        {o.order_kind === 'reel_edit' && (
          <span className="ml-2 pill bg-ocean-100 text-ocean-700">REEL</span>
        )}
        {o.rush && <span className="ml-2 pill bg-rose-100 text-rose-700">RUSH</span>}
      </>
    ),
  },
  { key: 'address', header: 'Address', className: 'text-slate-700', cell: (o) => (o.listings ? fmtAddress(o.listings) : '—') },
  {
    key: 'client',
    header: 'Client',
    className: 'text-slate-700',
    cell: (o) => (
      <>
        <div>{o.clients?.full_name ?? '—'}</div>
        <div className="text-xs text-slate-500">{o.clients?.brokerage ?? ''}</div>
      </>
    ),
  },
  { key: 'scheduled', header: 'Scheduled', className: 'text-slate-700', cell: (o) => fmtDateTime(o.scheduled_at) },
  { key: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string; kind?: string; archived?: string };
}) {
  const supabase = createClient();
  let query = supabase
    .from('orders')
    .select(
      'id, order_number, status, scheduled_at, rush, order_kind, listing_id, client_id, listings(address_line1, city, state, zip), clients(full_name, brokerage)'
    )
    .order('updated_at', { ascending: false })
    .limit(50);

  if (searchParams.status) query = query.eq('status', searchParams.status as any);
  if (searchParams.kind === 'reel') query = query.eq('order_kind', 'reel_edit');
  // Archived shoots stay out of sight unless explicitly requested.
  if (searchParams.archived === '1') query = query.not('archived_at', 'is', null);
  else query = query.is('archived_at', null);

  const { data: orders, error } = await query;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Pipeline" title="Orders" subtitle="Every shoot in the pipeline.">
        <Link href="/dashboard/orders/new" className="btn-primary">New shoot</Link>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <FilterPill label="All" href="/dashboard/orders" active={!searchParams.status && !searchParams.kind} />
        <FilterPill label="Reels" href="/dashboard/orders?kind=reel" active={searchParams.kind === 'reel'} />
        <FilterPill label="Archived" href="/dashboard/orders?archived=1" active={searchParams.archived === '1'} />
        {['draft', 'booked', 'scheduled', 'shooting', 'uploaded', 'processing', 'editing', 'ready', 'delivered'].map((s) => (
          <FilterPill
            key={s}
            label={STATUS_LABEL[s]}
            href={`/dashboard/orders?status=${s}`}
            active={searchParams.status === s}
          />
        ))}
      </div>

      <DataTable
        columns={COLUMNS}
        rows={orders ?? []}
        rowKey={(o) => o.id}
        rowHref={(o) => `/dashboard/orders/${o.id}`}
        empty={
          <EmptyState
            icon={ClipboardList}
            title={searchParams.status ? 'No orders in this status' : 'No orders yet'}
            description={
              searchParams.status
                ? 'Try a different filter, or create a new order.'
                : 'New bookings and manually-added shoots will show up here.'
            }
            action={
              <Link href="/dashboard/orders/new" className="btn-primary">
                New shoot
              </Link>
            }
          />
        }
        error={error?.message ?? null}
      />
    </div>
  );
}

function FilterPill({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`pill border ${active ? 'bg-ocean-700 text-white border-ocean-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
    >
      {label}
    </Link>
  );
}
