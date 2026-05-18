import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { localToUtc, dayOfWeekInTz } from '@/lib/utils/timezone';
import { fetchBusyRanges } from '@/lib/google-calendar/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/availability?date=YYYY-MM-DD&duration=N
 *
 * Returns 30-min start slots where AT LEAST ONE active photographer
 * is free for `duration` minutes, given their team_availability hours
 * and existing scheduled orders / schedule_blocks.
 *
 * Each slot includes the photographer_id that will fulfil it (first match).
 */
const SLOT_MINUTES = 30;

interface Photographer {
  id: string;
  timezone: string;
  // List of {startUtcMs, endUtcMs} working windows on the requested day
  windows: Array<{ start: number; end: number }>;
  // Existing busy ranges (orders + blocks)
  busy: Array<{ start: number; end: number }>;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dateStr = url.searchParams.get('date');
  const duration = Math.max(15, parseInt(url.searchParams.get('duration') || '60', 10));
  if (!dateStr) return NextResponse.json({ error: 'date required' }, { status: 400 });

  // Don't allow past dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requested = new Date(`${dateStr}T12:00:00Z`);
  if (requested < today) return NextResponse.json({ slots: [] });

  const supabase = createAdminClient();

  // Load org-wide booking guards.
  const { data: settings } = await supabase
    .from('business_settings')
    .select('buffer_minutes, min_notice_hours, max_notice_days, default_timezone')
    .eq('id', true)
    .maybeSingle();
  const bufferMs = ((settings as any)?.buffer_minutes ?? 30) * 60_000;
  const minNoticeMs = ((settings as any)?.min_notice_hours ?? 4) * 3_600_000;
  const maxNoticeDays = (settings as any)?.max_notice_days ?? 30;

  // Reject dates outside the max-notice window
  const horizon = new Date();
  horizon.setHours(0, 0, 0, 0);
  horizon.setDate(horizon.getDate() + maxNoticeDays);
  if (requested > horizon) return NextResponse.json({ slots: [], reason: 'outside_max_notice' });

  // Active photographers with at least one availability row
  const { data: members } = await supabase
    .from('team_members')
    .select('id, role, is_active')
    .in('role', ['admin', 'photographer'])
    .eq('is_active', true);

  if (!members?.length) return NextResponse.json({ slots: [] });
  const memberIds = members.map((m: any) => m.id);

  const { data: avail } = await supabase
    .from('team_availability')
    .select('team_member_id, day_of_week, start_local, end_local, timezone, is_active')
    .in('team_member_id', memberIds)
    .eq('is_active', true);

  if (!avail?.length) return NextResponse.json({ slots: [], reason: 'no_hours_configured' });

  // Compute the broad UTC range for the day so we can fetch busy events once.
  // Use a generous window (24h either side) since we don't know each TZ yet.
  const dayStart = new Date(`${dateStr}T00:00:00Z`).getTime() - 24 * 3600 * 1000;
  const dayEnd = new Date(`${dateStr}T00:00:00Z`).getTime() + 48 * 3600 * 1000;

  const [{ data: orders }, { data: blocks }] = await Promise.all([
    supabase
      .from('orders')
      .select('photographer_id, scheduled_at, duration_minutes, status')
      .gte('scheduled_at', new Date(dayStart).toISOString())
      .lte('scheduled_at', new Date(dayEnd).toISOString())
      .not('status', 'in', '("cancelled","draft")'),
    supabase
      .from('schedule_blocks')
      .select('team_member_id, starts_at, ends_at, is_available')
      .gte('starts_at', new Date(dayStart).toISOString())
      .lte('ends_at', new Date(dayEnd).toISOString())
      .eq('is_available', false),
  ]);

  // Build per-photographer state
  const photographers = new Map<string, Photographer>();
  for (const a of avail as any[]) {
    const dow = dayOfWeekInTz(dateStr, a.timezone);
    if (dow !== a.day_of_week) continue;
    const start = localToUtc(dateStr, a.start_local.slice(0, 5), a.timezone).getTime();
    const end = localToUtc(dateStr, a.end_local.slice(0, 5), a.timezone).getTime();
    const ph = photographers.get(a.team_member_id) ?? {
      id: a.team_member_id,
      timezone: a.timezone,
      windows: [],
      busy: [],
    };
    ph.windows.push({ start, end });
    photographers.set(a.team_member_id, ph);
  }
  for (const o of (orders ?? []) as any[]) {
    if (!o.photographer_id) continue;
    const ph = photographers.get(o.photographer_id);
    if (!ph) continue;
    const s = new Date(o.scheduled_at).getTime();
    ph.busy.push({ start: s, end: s + (o.duration_minutes ?? 60) * 60 * 1000 });
  }
  for (const b of (blocks ?? []) as any[]) {
    const ph = photographers.get(b.team_member_id);
    if (!ph) continue;
    ph.busy.push({ start: new Date(b.starts_at).getTime(), end: new Date(b.ends_at).getTime() });
  }

  // Layer in Google Calendar busy events (best-effort, parallel).
  await Promise.all(
    Array.from(photographers.values()).map(async (ph) => {
      try {
        const ranges = await fetchBusyRanges(
          ph.id,
          new Date(dayStart).toISOString(),
          new Date(dayEnd).toISOString()
        );
        for (const r of ranges) {
          ph.busy.push({ start: new Date(r.start).getTime(), end: new Date(r.end).getTime() });
        }
      } catch {
        // Calendar fetch failure should not block slot generation.
      }
    })
  );

  // For each photographer, generate their slots, then merge with photographer attribution.
  const earliestAllowed = Date.now() + minNoticeMs;
  type Slot = { iso: string; photographer_id: string };
  const slotMap = new Map<string, Slot>();
  for (const ph of photographers.values()) {
    for (const w of ph.windows) {
      for (let t = w.start; t + duration * 60_000 <= w.end; t += SLOT_MINUTES * 60_000) {
        const tEnd = t + duration * 60_000;
        // Min notice
        if (t < earliestAllowed) continue;
        // Buffer-aware conflict check
        const overlaps = ph.busy.some((b) => t < b.end + bufferMs && tEnd + bufferMs > b.start);
        if (overlaps) continue;
        const iso = new Date(t).toISOString();
        if (!slotMap.has(iso)) slotMap.set(iso, { iso, photographer_id: ph.id });
      }
    }
  }

  const slots = Array.from(slotMap.values()).sort((a, b) => a.iso.localeCompare(b.iso));
  return NextResponse.json({ slots, duration });
}
