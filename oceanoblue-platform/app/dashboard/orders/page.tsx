import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime, fmtAddress, STATUS_LABEL, STATUS_COLOR } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const supabase = createClient();
  let query = supabase
    .from('orders')
    .select(
      'id, order_number, status, scheduled_at, rush, listing_id, client_id, listings(address_line1, city, state, zip), clients(full_name, brokerage)'
    )
    .order('updated_at', { ascending: false })
    .limit(50);

  if (searchParams.status) query = query.eq('status', searchParams.status as any);

  const { data: orders, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ocean-950">Orders</h1>
          <p className="text-sm text-slate-600">Every shoot in the pipeline.</p>
        </div>
        <Link href="/dashboard/orders/new" className="btn-primary">New order</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterPill label="All" href="/dashboard/orders" active={!searchParams.status} />
        {['draft', 'booked', 'scheduled', 'shooting', 'uploaded', 'processing', 'editing', 'ready', 'delivered'].map((s) => (
          <FilterPill
            key={s}
            label={STATUS_LABEL[s]}
            href={`/dashboard/orders?status=${s}`}
            active={searchParams.status === s}
          />
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head px-4 py-3">Order</th>
              <th className="table-head px-4 py-3">Address</th>
              <th className="table-head px-4 py-3">Client</th>
              <th className="table-head px-4 py-3">Scheduled</th>
              <th className="table-head px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {error && (
              <tr><td colSpan={5} className="px-4 py-6 text-rose-600 text-sm">{error.message}</td></tr>
            )}
            {(orders ?? []).map((o: any) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/orders/${o.id}`} className="font-medium text-ocean-800 hover:underline">
                    #{o.order_number}
                  </Link>
                  {o.rush && <span className="ml-2 pill bg-rose-100 text-rose-700">RUSH</span>}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {o.listings ? fmtAddress(o.listings) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  <div>{o.clients?.full_name ?? '—'}</div>
                  <div className="text-xs text-slate-500">{o.clients?.brokerage ?? ''}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{fmtDateTime(o.scheduled_at)}</td>
                <td className="px-4 py-3">
                  <span className={`pill ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                </td>
              </tr>
            ))}
            {!error && (orders ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No orders yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
