import { createAdminClient } from '@/lib/supabase/server';
import { localToUtc, dayOfWeekInTz, fmtDateInTz } from '@/lib/utils/timezone';
import { fetchBusyRanges } from '@/lib/google-calendar/api';
import { validDate } from './validation';
import { captureError } from '@/lib/observability/report';

const SLOT_MINUTES = 30;

interface Photographer {
  id: string;
  timezone: string;
  // List of {startUtcMs, endUtcMs} working windows on the requested day
  windows: Array<{ start: number; end: number }>;
  // Existing busy ranges (orders + blocks)
  busy: Array<{ start: number; end: number }>;
}

export async function getAvailability(dateStr: string, duration: number, photographerId?: string) {
  if (!validDate(dateStr) || !Number.isInteger(duration) || duration < 15 || duration > 720) {
    throw new Error('invalid_availability_query');
  }
  const supabase = createAdminClient();

  // Load org-wide booking guards.
  const { data: settings, error: settingsError } = await supabase
    .from('business_settings')
    .select('buffer_minutes, min_notice_hours, max_notice_days, default_timezone')
    .eq('id', true)
    .maybeSingle();
  if (settingsError) throw settingsError;
  const timezone = settings?.default_timezone || 'America/New_York';
  const requested = new Date(`${dateStr}T12:00:00Z`);
  const todayStr = fmtDateInTz(new Date(), timezone, 'iso');
  if (dateStr < todayStr) return { slots: [], calendarDegraded: false };
  const bufferMs = ((settings as any)?.buffer_minutes ?? 30) * 60_000;
  const minNoticeMs = ((settings as any)?.min_notice_hours ?? 4) * 3_600_000;
  const maxNoticeDays = (settings as any)?.max_notice_days ?? 30;

  // Reject dates outside the max-notice window
  const horizon = new Date(`${todayStr}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + maxNoticeDays);
  if (requested > horizon) return { slots: [], calendarDegraded: false };

  // Active photographers with at least one availability row
  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('id, role, is_active')
    .in('role', ['admin', 'photographer'])
    .eq('is_active', true);

  if (membersError) throw membersError;
  const memberIds = (members ?? []).filter(m => !photographerId || m.id === photographerId).map(m => m.id);
  if (!memberIds.length) return { slots: [], calendarDegraded: false };

  const { data: avail, error: availError } = await supabase
    .from('team_availability')
    .select('team_member_id, day_of_week, start_local, end_local, timezone, is_active')
    .in('team_member_id', memberIds)
    .eq('is_active', true);

  if (availError) throw availError;
  if (!avail?.length) return { slots: [], calendarDegraded: false, reason: 'no_hours_configured' };

  // Compute the broad UTC range for the day so we can fetch busy events once.
  // Use a generous window (24h either side) since we don't know each TZ yet.
  const dayStart = new Date(`${dateStr}T00:00:00Z`).getTime() - 24 * 3600 * 1000;
  const dayEnd = new Date(`${dateStr}T00:00:00Z`).getTime() + 48 * 3600 * 1000;

  const [{ data: orders, error: ordersError }, { data: blocks, error: blocksError }] = await Promise.all([
    supabase
      .from('orders')
      .select('photographer_id, scheduled_at, duration_minutes, status')
      .gte('scheduled_at', new Date(dayStart).toISOString())
      .lte('scheduled_at', new Date(dayEnd).toISOString())
      .not('status', 'in', '("cancelled","draft")'),
    supabase
      .from('schedule_blocks')
      .select('team_member_id, starts_at, ends_at, is_available')
      .lt('starts_at', new Date(dayEnd).toISOString())
      .gt('ends_at', new Date(dayStart).toISOString())
      .eq('is_available', false),
  ]);

  if (ordersError || blocksError) throw ordersError || blocksError;

  // Build per-photographer state
  const photographers = new Map<string, Photographer>();
  for (const a of avail as any[]) {
    const dow = dayOfWeekInTz(dateStr, a.timezone);
    if (dow !== a.day_of_week) continue;
    const start = localToUtc(dateStr, a.start_local.slice(0, 5), a.timezone).getTime();
    const end = localToUtc(dateStr, a.end_local.slice(0, 5), a.timezone).getTime();
    const ph: Photographer = photographers.get(a.team_member_id) ?? {
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

  // Connected calendars must be verified before offering their slots.
  let calendarDegraded = false;
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
      } catch (error) {
        captureError('booking.calendarAvailability', error, { teamMemberId: ph.id });
        calendarDegraded = true;
        photographers.delete(ph.id);
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
  return { slots, duration, calendarDegraded };
}
