import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL, fmtDateTime, fmtAddress } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';

export const dynamic = 'force-dynamic';

const usd = (cents?: number | null) =>
  cents && cents > 0 ? `$${(cents / 100).toLocaleString('en-US')}` : '—';

const COLUMNS: Column<any>[] = [
  {
    key: 'order',
    header: 'Order',
    cell: (o) => (
      <>
        <span className="font-medium text-ocean-800">#{o.order_number}</span>
        {o.project_type === 'architectural' && (
          <span className="ml-2 pill bg-violet-100 text-violet-700">ARCH</span>
        )}
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
      <div className="flex items-center gap-2.5">
        <Avatar name={o.clients?.full_name} />
        <div className="min-w-0">
          <div className="truncate font-medium text-ocean-900">{o.clients?.full_name ?? '—'}</div>
          {o.clients?.brokerage && (
            <div className="truncate text-xs text-slate-500">{o.clients.brokerage}</div>
          )}
        </div>
      </div>
    ),
  },
  { key: 'scheduled', header: 'Scheduled', className: 'text-slate-700', cell: (o) => fmtDateTime(o.scheduled_at) },
  {
    key: 'total',
    header: 'Total',
    className: 'text-slate-700 tabular-nums',
    cell: (o) => (
      <span className="inline-flex items-center gap-1.5">
        {usd(o.total_cents)}
        {o.download_paid_at && <span className="pill bg-emerald-100 text-emerald-700">PAID</span>}
      </span>
    ),
  },
  { key: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
];

// How each sortable column is compared. Returns null for "no value" so those
// rows always sort to the bottom regardless of direction.
const SORT_ACCESSORS: Record<string, (o: any) => number | string | null> = {
  order: (o) => o.order_number ?? null,
  address: (o) => o.listings?.address_line1?.toLowerCase() ?? null,
  client: (o) => o.clients?.full_name?.toLowerCase() ?? null,
  scheduled: (o) => (o.scheduled_at ? new Date(o.scheduled_at).getTime() : null),
  total: (o) => (o.total_cents && o.total_cents > 0 ? o.total_cents : null),
  status: (o) => o.status ?? null,
};

function sortRows(rows: any[], key: string, asc: boolean) {
  const val = SORT_ACCESSORS[key] ?? SORT_ACCESSORS.scheduled;
  const dir = asc ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    const an = va == null;
    const bn = vb == null;
    if (an && bn) return 0;
    if (an) return 1; // nulls last, always
    if (bn) return -1;
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string; kind?: string; archived?: string; sort?: string; dir?: string };
}) {
  const sortKey =
    searchParams.sort && searchParams.sort in SORT_ACCESSORS ? searchParams.sort : 'scheduled';
  const asc = searchParams.dir === 'asc'; // default: descending (newest first)

  const supabase = createClient();
  let query = supabase
    .from('orders')
    .select(
      'id, order_number, status, scheduled_at, rush, order_kind, project_type, listing_id, client_id, total_cents, download_paid_at, listings(address_line1, city, state, zip), clients(full_name, brokerage)'
    )
    // Pull a generous window ordered by date, then sort the page by the chosen
    // column in-memory (works uniformly for joined columns like Address/Client).
    .order('scheduled_at', { ascending: false, nullsFirst: false })
    .limit(300);

  if (searchParams.status) query = query.eq('status', searchParams.status as any);
  if (searchParams.kind === 'reel') query = query.eq('order_kind', 'reel_edit');
  // Archived shoots stay out of sight unless explicitly requested.
  if (searchParams.archived === '1') query = query.not('archived_at', 'is', null);
  else query = query.is('archived_at', null);

  const { data: ordersRaw, error } = await query;
  const orders = sortRows(ordersRaw ?? [], sortKey, asc);

  // Build a sort URL that keeps the active filters and toggles direction when
  // the same column is clicked again.
  const sortHref = (key: string) => {
    const p = new URLSearchParams();
    if (searchParams.status) p.set('status', searchParams.status);
    if (searchParams.kind) p.set('kind', searchParams.kind);
    if (searchParams.archived) p.set('archived', searchParams.archived);
    const nextAsc = !(sortKey === key && asc); // asc → desc on the active column, else asc
    p.set('sort', key);
    p.set('dir', nextAsc ? 'asc' : 'desc');
    return `/dashboard/orders?${p.toString()}`;
  };

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
        columns={COLUMNS.map((c) => ({ ...c, sortable: true }))}
        rows={orders}
        sort={{ key: sortKey, dir: asc ? 'asc' : 'desc' }}
        sortHref={sortHref}
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
