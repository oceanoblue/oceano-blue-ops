import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime, STATUS_LABEL, STATUS_COLOR } from '@/lib/utils/format';
import { BookingLinkButton } from '@/components/BookingLinkButton';

export const dynamic = 'force-dynamic';

const PIPELINE_BUCKETS: Array<{ label: string; statuses: string[] }> = [
  { label: 'New / draft', statuses: ['draft'] },
  { label: 'Booked', statuses: ['booked', 'scheduled'] },
  { label: 'On site', statuses: ['shooting', 'uploaded'] },
  { label: 'In production', statuses: ['processing', 'editing'] },
  { label: 'Ready', statuses: ['ready'] },
  { label: 'Delivered (7d)', statuses: ['delivered'] },
];

export default async function DashboardHome() {
  const supabase = createClient();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status, scheduled_at, rush, client_id')
    .order('updated_at', { ascending: false })
    .limit(10);

  const counts: Record<string, number> = {};
  for (const b of PIPELINE_BUCKETS) {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('status', b.statuses);
    counts[b.label] = count ?? 0;
  }

  const { data: upcoming } = await supabase
    .from('orders')
    .select('id, order_number, scheduled_at, status, photographer_id, listing_id, client_id')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(5);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ocean-950">Overview</h1>
          <p className="text-sm text-slate-600">What's moving through the pipeline today.</p>
        </div>
        <BookingLinkButton />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {PIPELINE_BUCKETS.map((b) => (
          <div key={b.label} className="card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{b.label}</div>
            <div className="mt-1 text-2xl font-bold text-ocean-900">{counts[b.label] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Upcoming shoots</h2>
            <Link href="/dashboard/schedule" className="text-sm text-ocean-700 hover:underline">
              Open schedule →
            </Link>
          </header>
          <ul className="divide-y divide-slate-100">
            {(upcoming ?? []).length === 0 && (
              <li className="text-sm text-slate-500 py-3">Nothing scheduled in the future yet.</li>
            )}
            {(upcoming ?? []).map((o) => (
              <li key={o.id} className="flex items-center justify-between py-3">
                <div>
                  <Link href={`/dashboard/orders/${o.id}`} className="font-medium hover:underline">
                    #{o.order_number}
                  </Link>
                  <div className="text-xs text-slate-500">{fmtDateTime(o.scheduled_at)}</div>
                </div>
                <span className={`pill ${STATUS_COLOR[o.status] ?? ''}`}>{STATUS_LABEL[o.status]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-6">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recently updated</h2>
            <Link href="/dashboard/orders" className="text-sm text-ocean-700 hover:underline">
              All orders →
            </Link>
          </header>
          <ul className="divide-y divide-slate-100">
            {(orders ?? []).map((o) => (
              <li key={o.id} className="flex items-center justify-between py-3">
                <Link href={`/dashboard/orders/${o.id}`} className="font-medium hover:underline">
                  #{o.order_number}
                </Link>
                <span className={`pill ${STATUS_COLOR[o.status] ?? ''}`}>{STATUS_LABEL[o.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
