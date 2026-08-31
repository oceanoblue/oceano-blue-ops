import { redirect } from 'next/navigation';
import Link from 'next/link';
import { MapPin, CalendarDays } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fmtCents } from '@/lib/utils/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PortalHero } from '@/components/portal/PortalHero';
import { FieldNav } from '@/components/field/FieldNav';

export const dynamic = 'force-dynamic';

// Pay-tier styling. Tier (small/large) comes from the field_orders view (sqft
// based, same rule the payout uses); the dollar amount shown is the contractor's
// own pay. The client price is never exposed.
const TIER = {
  small: { dot: 'bg-sky-500', ring: 'ring-sky-200', bar: 'bg-sky-400' },
  large: { dot: 'bg-emerald-500', ring: 'ring-emerald-200', bar: 'bg-emerald-400' },
} as const;

type Shoot = {
  id: string;
  status: string;
  scheduled_at: string | null;
  pay_amount_cents: number | null;
  pay_tier: 'small' | 'large' | null;
  has_360: boolean | null;
  contractor_response: string | null;
  listing: {
    address_line1?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
};

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default async function FieldCalendarPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/field');

  const { data: me } = await supabase
    .from('contractors')
    .select('id, full_name')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!me) redirect('/field/shoots');

  // Scheduled shoots only, self-scoped by the view.
  const { data: rows } = await supabase
    .from('field_orders')
    .select(
      'id, status, scheduled_at, pay_amount_cents, pay_tier, has_360, contractor_response, listing'
    )
    .not('scheduled_at', 'is', null)
    .order('scheduled_at', { ascending: true });

  const shoots = (rows ?? []) as Shoot[];
  const now = Date.now();
  const upcoming = shoots.filter((s) => s.scheduled_at && new Date(s.scheduled_at).getTime() >= now);
  const past = shoots
    .filter((s) => s.scheduled_at && new Date(s.scheduled_at).getTime() < now)
    .reverse(); // most recent first

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHero
        eyebrow="Photographers"
        title="Calendar"
        subtitle="Your scheduled shoots. Color = pay tier; the violet 360 badge means it includes a 360 / Matterport tour."
      >
        <FieldNav />
      </PortalHero>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <Legend />

        {upcoming.length === 0 && past.length === 0 ? (
          <div className="card mt-4">
            <EmptyState
              icon={CalendarDays}
              title="No scheduled shoots"
              description="When the office schedules you for a shoot, it shows up here with its date and pay."
              action={
                <Link href="/field/shoots" className="btn-primary">
                  View my shoots
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-4 space-y-8">
            {upcoming.length > 0 && <DayGroups title="Upcoming" shoots={upcoming} />}
            {past.length > 0 && <DayGroups title="Earlier" shoots={past} dim />}
          </div>
        )}
      </main>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-white px-4 py-3 text-xs text-slate-600 shadow-soft ring-1 ring-slate-100">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Standard (≤2,000 sqft)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Larger ({'>'}2,000 sqft)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-700">360</span>{' '}
        360 / Matterport tour
      </span>
    </div>
  );
}

function DayGroups({ title, shoots, dim }: { title: string; shoots: Shoot[]; dim?: boolean }) {
  // Bucket into day headers, preserving the incoming order.
  const groups: { key: string; items: Shoot[] }[] = [];
  for (const s of shoots) {
    if (!s.scheduled_at) continue;
    const key = dayKey(s.scheduled_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(s);
    else groups.push({ key, items: [s] });
  }

  return (
    <section className={dim ? 'opacity-75' : ''}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="mb-2 text-sm font-semibold text-ink-900">{g.key}</div>
            <ul className="space-y-2">
              {g.items.map((s) => (
                <ShootRow key={s.id} s={s} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShootRow({ s }: { s: Shoot }) {
  const tier = TIER[(s.pay_tier ?? 'small') as 'small' | 'large'];
  const l = s.listing ?? {};
  const declined = s.contractor_response === 'declined';

  return (
    <li>
      <Link
        href={`/field/shoots/${s.id}`}
        className={`card-interactive group flex items-stretch gap-0 overflow-hidden p-0 ${
          declined ? 'opacity-60' : ''
        }`}
      >
        <span className={`w-1.5 shrink-0 ${tier.bar}`} aria-hidden />
        <div className="flex flex-1 items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-ink-900">
                {l.address_line1 ?? 'Address pending'}
              </span>
              {s.has_360 && (
                <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
                  360
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">
                {[l.city, l.state].filter(Boolean).join(', ') || '—'}
              </span>
              {s.scheduled_at && (
                <>
                  <span>·</span>
                  <span className="whitespace-nowrap">{timeLabel(s.scheduled_at)}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <span className={`h-2 w-2 rounded-full ${tier.dot}`} />
              {fmtCents(s.pay_amount_cents)}
            </span>
            {s.contractor_response ? (
              <span
                className={`text-[11px] font-medium ${
                  declined ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {declined ? 'Declined' : 'Accepted'}
              </span>
            ) : (
              <StatusBadge status={s.status} className="scale-90" />
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
