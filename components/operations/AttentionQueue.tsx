import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { calendarNeedsReconnect } from '@/lib/google-calendar/health';
import { fmtDateTime } from '@/lib/utils/format';

type Attention = { key: string; title: string; reason: string; href: string; at?: string };

export async function AttentionQueue() {
  const client = await createClient();
  const now = Date.now();
  const results = await Promise.all([
    client.from('jobs').select('id, title, status, updated_at').in('status', ['ingesting', 'processing'])
      .lt('updated_at', new Date(now - 86400000).toISOString()).order('updated_at').limit(20),
    client.from('ai_jobs').select('id, order_id, created_at').eq('status', 'failed').order('created_at', { ascending: false }).limit(10),
    client.from('team_calendar_connections').select('team_member_id, is_active, scope'),
    (client as any).from('booking_followups').select('id, order_id, kind, status, created_at')
      .neq('status', 'complete').lt('created_at', new Date(now - 300000).toISOString()).order('created_at').limit(20),
  ]);
  const rows: Attention[] = [];
  for (const job of results[0].data || []) rows.push({ key: job.id, title: job.title,
    reason: `${job.status} with no update for over 24 hours. Confirm whether work is paused or needs recovery.`, href: `/dashboard/jobs/${job.id}`, at: job.updated_at });
  for (const job of results[1].data || []) rows.push({ key: job.id, title: 'Failed photo processing',
    reason: 'Review the failed step before retrying.', href: `/dashboard/orders/${job.order_id}`, at: job.created_at });
  const reconnect = (results[2].data || []).filter(calendarNeedsReconnect).length;
  if (reconnect) rows.push({ key: 'calendar', title: 'Google Calendar needs attention',
    reason: `${reconnect} connection${reconnect === 1 ? '' : 's'} must be reconnected by the account owner to verify availability.`, href: '/dashboard/settings/integrations' });
  for (const job of results[3].data || []) rows.push({ key: job.id, title: `Booking ${job.kind.replace(/_/g, ' ')}`,
    reason: job.status === 'needs_review' ? 'Delivery is uncertain. Check the provider before resending.'
      : job.status === 'failed' ? 'Automatic retries exhausted. Review the order and integration.' : 'Follow-up is delayed; automatic delivery is pending.',
    href: `/dashboard/orders/${job.order_id}`, at: job.created_at });
  const unavailable = results.some(result => result.error);
  if (!rows.length && !unavailable) return null;
  return <section className="card p-4 sm:p-6 space-y-3">
    <div><h2 className="font-semibold text-ocean-950">Needs attention</h2>
      <p className="text-sm text-slate-600">Office review queue · oldest work first within each category</p></div>
    {unavailable && <p role="alert" className="text-sm text-amber-800">Some health checks could not load. Refresh to check again.</p>}
    <ul className="divide-y divide-slate-100">{rows.map(row => <li key={row.key} className="py-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="font-medium text-sm">{row.title}</p><p className="text-sm text-slate-600">{row.reason}</p>
        {row.at && <p className="text-xs text-slate-500 mt-1">Last activity: {fmtDateTime(row.at)}</p>}</div>
      <Link className="btn-secondary text-xs shrink-0" href={row.href}>Review</Link>
    </li>)}</ul>
    {rows.length >= 20 && <p className="text-xs text-slate-500">This is a limited preview. Open Jobs or Orders to review all work.</p>}
  </section>;
}
