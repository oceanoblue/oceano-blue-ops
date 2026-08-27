import Link from 'next/link';
import { CalendarClock, FileEdit, CalendarCheck2, Camera, Cog, PackageCheck, Send, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime } from '@/lib/utils/format';
import type { OrderStatus } from '@/lib/supabase/database.types';
import { BookingLinkButton } from '@/components/BookingLinkButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';

export const dynamic = 'force-dynamic';

const PIPELINE_BUCKETS: Array<{
  label: string;
  statuses: string[];
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { label: 'New / draft', statuses: ['draft'], icon: FileEdit },
  { label: 'Booked', statuses: ['booked', 'scheduled'], icon: CalendarCheck2 },
  { label: 'On site', statuses: ['shooting', 'uploaded'], icon: Camera },
  { label: 'In production', statuses: ['processing', 'editing'], icon: Cog },
  { label: 'Ready', statuses: ['ready'], icon: PackageCheck },
  { label: 'Delivered', statuses: ['delivered'], icon: Send },
];

export default async function DashboardHome() {
  const supabase = createClient();

  // One round-trip's latency, not eight: the recent list, all six pipeline
  // counts, and the upcoming list are independent — fire them together.
  const [{ data: orders }, bucketCounts, { data: upcoming }, { data: declined }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_number, status, scheduled_at, rush, client_id')
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(8),
    Promise.all(
      PIPELINE_BUCKETS.map((b) =>
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .is('archived_at', null)
          .in('status', b.statuses as OrderStatus[])
          .then(({ count }) => [b.label, count ?? 0] as const)
      )
    ),
    supabase
      .from('orders')
      .select('id, order_number, scheduled_at, status, photographer_id, listing_id, client_id')
      .is('archived_at', null)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5),
    // Shoots the assigned photographer declined — surfaced so a hand-back isn't
    // silent. Cast: contractor_response lives in the DB but not the typed schema.
    (supabase as any)
      .from('orders')
      .select('id, order_number, contractor_response_note, contractor_responded_at, listings(address_line1, city), contractors(full_name)')
      .eq('contractor_response', 'declined')
      .is('archived_at', null)
      .order('contractor_responded_at', { ascending: false })
      .limit(10),
  ]);
  const counts: Record<string, number> = Object.fromEntries(bucketCounts);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Production OS" title="Overview" subtitle="What's moving through the pipeline today.">
        <BookingLinkButton />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {PIPELINE_BUCKETS.map((b) => (
          <StatCard
            key={b.label}
            label={b.label}
            value={counts[b.label] ?? 0}
            icon={b.icon}
            href={`/dashboard/orders?status=${b.statuses[0]}`}
          />
        ))}
      </div>

      {(declined ?? []).length > 0 && (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <h2 className="inline-flex items-center gap-2 font-semibold text-rose-800">
            <AlertTriangle className="h-4 w-4" /> Declined shoots need reassigning ({(declined ?? []).length})
          </h2>
          <ul className="mt-2 divide-y divide-rose-100">
            {(declined ?? []).map((o: any) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <Link href={`/dashboard/orders/${o.id}`} className="font-medium text-rose-900 hover:underline">
                    #{o.order_number}
                  </Link>
                  <span className="text-rose-700"> — {o.contractors?.full_name ?? 'Photographer'} declined</span>
                  {o.contractor_response_note && <span className="text-rose-600"> · “{o.contractor_response_note}”</span>}
                  <div className="text-xs text-rose-500">
                    {[o.listings?.address_line1, o.listings?.city].filter(Boolean).join(', ')}
                    {o.contractor_responded_at ? ` · ${fmtDateTime(o.contractor_responded_at)}` : ''}
                  </div>
                </div>
                <Link
                  href={`/dashboard/orders/${o.id}`}
                  className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
                >
                  Reassign
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 font-semibold text-slate-900">
              <CalendarClock className="h-4 w-4 text-slate-500" /> Upcoming shoots
            </h2>
            <Link href="/dashboard/schedule" className="text-sm text-ocean-700 hover:underline">
              Open schedule →
            </Link>
          </header>
          {(upcoming ?? []).length === 0 ? (
            <EmptyState
              compact
              icon={CalendarClock}
              title="Nothing scheduled yet"
              description="Booked shoots with a future date will show up here."
            />
          ) : (
            <ul className="-my-1 divide-y divide-slate-100">
              {(upcoming ?? []).map((o) => (
                <li key={o.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link href={`/dashboard/orders/${o.id}`} className="font-medium hover:underline">
                      #{o.order_number}
                    </Link>
                    <div className="text-xs text-slate-500">{fmtDateTime(o.scheduled_at)}</div>
                  </div>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recently updated</h2>
            <Link href="/dashboard/orders" className="text-sm text-ocean-700 hover:underline">
              All orders →
            </Link>
          </header>
          {(orders ?? []).length === 0 ? (
            <EmptyState
              compact
              icon={FileEdit}
              title="No orders yet"
              description="New bookings and orders will appear here as they come in."
            />
          ) : (
            <ul className="-my-1 divide-y divide-slate-100">
              {(orders ?? []).map((o) => (
                <li key={o.id} className="flex items-center justify-between py-3">
                  <Link href={`/dashboard/orders/${o.id}`} className="font-medium hover:underline">
                    #{o.order_number}
                    {o.rush && <span className="ml-2 pill bg-rose-100 text-rose-700">RUSH</span>}
                  </Link>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
