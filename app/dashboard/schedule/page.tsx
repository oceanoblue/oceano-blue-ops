import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { fmtAddress, STATUS_LABEL, STATUS_COLOR } from '@/lib/utils/format';
import { fetchEvents, type GCalEvent } from '@/lib/google-calendar/events';

export const dynamic = 'force-dynamic';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = new Date();
  const weekStart = searchParams.week
    ? startOfWeek(parseISO(searchParams.week), { weekStartsOn: 1 })
    : startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);

  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, order_number, scheduled_at, duration_minutes, status, rush, photographer_id,
      listings(address_line1, city, state, zip),
      team_members:photographer_id(full_name)
    `)
    .gte('scheduled_at', weekStart.toISOString())
    .lt('scheduled_at', weekEnd.toISOString())
    .order('scheduled_at', { ascending: true });

  // Pull external Google Calendar events for the logged-in user (best-effort).
  let gcalEvents: GCalEvent[] = [];
  if (user) {
    try {
      gcalEvents = await fetchEvents(user.id, weekStart.toISOString(), weekEnd.toISOString());
    } catch {
      // Calendar fetch failure should not crash the schedule view.
    }
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ocean-950">Schedule</h1>
          <p className="text-sm text-slate-600">Week of {format(weekStart, 'MMMM d, yyyy')}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/schedule?week=${format(addDays(weekStart, -7), 'yyyy-MM-dd')}`}
            className="btn-secondary"
          >
            ← Prev
          </Link>
          <Link href="/dashboard/schedule" className="btn-secondary">Today</Link>
          <Link
            href={`/dashboard/schedule?week=${format(addDays(weekStart, 7), 'yyyy-MM-dd')}`}
            className="btn-secondary"
          >
            Next →
          </Link>
        </div>
      </div>

      {gcalEvents.length > 0 && (
        <div className="text-xs text-slate-500 flex items-center gap-4">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-ocean-700" />
            Oceano Blue shoots
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-slate-400" />
            Busy on Google Calendar (titles hidden)
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {days.map((d) => {
          const dayOrders = (orders ?? []).filter(
            (o: any) => o.scheduled_at && isSameDay(new Date(o.scheduled_at), d)
          );
          const dayGcal = gcalEvents.filter((e) => isSameDay(new Date(e.startIso), d));
          const isToday = isSameDay(d, today);
          // Combine into a single time-ordered list
          type Item =
            | { kind: 'order'; t: number; order: any }
            | { kind: 'gcal'; t: number; event: GCalEvent };
          const items: Item[] = [
            ...dayOrders.map((o: any) => ({
              kind: 'order' as const,
              t: new Date(o.scheduled_at).getTime(),
              order: o,
            })),
            ...dayGcal.map((e) => ({ kind: 'gcal' as const, t: new Date(e.startIso).getTime(), event: e })),
          ].sort((a, b) => a.t - b.t);

          return (
            <div
              key={d.toISOString()}
              className={`card p-3 min-h-[180px] ${isToday ? 'ring-2 ring-ocean-300' : ''}`}
            >
              <div className="text-xs uppercase tracking-wide text-slate-500">{format(d, 'EEE')}</div>
              <div className="text-lg font-semibold text-ocean-900">{format(d, 'd')}</div>
              <ul className="mt-3 space-y-2">
                {items.length === 0 && <li className="text-xs text-slate-400">Nothing scheduled</li>}
                {items.map((item) => {
                  if (item.kind === 'order') {
                    const o = item.order;
                    return (
                      <li key={`o-${o.id}`} className={`rounded-md p-2 text-xs ${STATUS_COLOR[o.status]}`}>
                        <Link href={`/dashboard/orders/${o.id}`} className="block">
                          <div className="font-medium">
                            {format(new Date(o.scheduled_at), 'h:mm a')} · #{o.order_number}
                          </div>
                          <div className="truncate">{o.listings ? fmtAddress(o.listings) : ''}</div>
                          {o.team_members?.full_name && (
                            <div className="opacity-75">📷 {o.team_members.full_name}</div>
                          )}
                        </Link>
                      </li>
                    );
                  }
                  const e = item.event;
                  const endT = new Date(e.endIso);
                  return (
                    <li
                      key={`g-${e.id}`}
                      className="rounded-md p-2 text-xs border border-dashed border-slate-300 bg-slate-50 text-slate-500"
                      title="Busy on your Google Calendar — title hidden for privacy"
                    >
                      <div className="font-medium">
                        {format(new Date(e.startIso), 'h:mm a')} – {format(endT, 'h:mm a')}
                      </div>
                      <div className="opacity-75 italic">Busy</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
