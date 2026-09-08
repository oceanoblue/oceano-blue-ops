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

const SORT_KEYS = new Set(['order','address','client','scheduled','total','status']);

export default async function OrdersPage(
  props: {
    searchParams: Promise<{ status?: string; q?: string; kind?: string; archived?: string; sort?: string; dir?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const sortKey =
    searchParams.sort && SORT_KEYS.has(searchParams.sort) ? searchParams.sort : 'scheduled';
  const asc = searchParams.dir === 'asc'; // default: descending (newest first)

  const supabase = await createClient();
  const page = Math.max(1, Math.min(100000, Number.parseInt(searchParams.page || '1', 10) || 1));
  const q = (searchParams.q || '').slice(0, 100);
  const statuses = searchParams.status?.split(',').filter(status => status in STATUS_LABEL) || null;
  const { data, error } = await (supabase as any).rpc('search_operations_orders', {
    p_statuses: statuses?.length ? statuses : null, p_kind: searchParams.kind === 'reel' ? 'reel_edit' : null,
    p_archived: searchParams.archived === '1', p_query: q, p_sort: sortKey, p_ascending: asc, p_page: page, p_size: 50,
  });
  const orders = data?.rows || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / 50));
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    for (const [key,value] of Object.entries(searchParams)) if (value) params.set(key, value);
    params.set('page', String(target));
    return `/dashboard/orders?${params.toString()}`;
  };

  // Build a sort URL that keeps the active filters and toggles direction when
  // the same column is clicked again.
  const sortHref = (key: string) => {
    const p = new URLSearchParams();
    if (searchParams.status) p.set('status', searchParams.status);
    if (q) p.set('q', q);
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

      <form className="flex flex-wrap items-end gap-2" action="/dashboard/orders">
        {Object.entries(searchParams).filter(([key]) => key !== 'q' && key !== 'page').map(([key,value]) => <input key={key} type="hidden" name={key} value={value || ''} />)}
        <label className="label flex-1">Search orders<input name="q" defaultValue={q} maxLength={100} className="input mt-1" placeholder="Order number, address, or client" /></label>
        <button className="btn-secondary">Search</button>
      </form>
      {!error && <p className="text-sm text-slate-600">{total} orders · Page {page} of {pages}</p>}
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
      {!error && <nav aria-label="Order pages" className="flex gap-4">
        {page > 1 && <Link className="btn-secondary" href={pageHref(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn-secondary" href={pageHref(page + 1)}>Next</Link>}
      </nav>}
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
