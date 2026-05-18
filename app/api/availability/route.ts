import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Public endpoint — returns 30-min slots between BUSINESS_HOURS where
 * an appointment of `duration` minutes can fit without colliding with
 * an existing order or a schedule_block.
 *
 * Query: ?date=YYYY-MM-DD&duration=60
 */
const BUSINESS_HOURS = { startHour: 8, endHour: 18 }; // 8 AM – 6 PM
const SLOT_MINUTES = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dateStr = url.searchParams.get('date');
  const duration = Math.max(30, parseInt(url.searchParams.get('duration') || '60', 10));
  if (!dateStr) return NextResponse.json({ error: 'date required' }, { status: 400 });

  const day = new Date(`${dateStr}T00:00:00`);
  if (isNaN(day.getTime())) return NextResponse.json({ error: 'bad date' }, { status: 400 });

  // Don't allow same-day or past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (day < today) return NextResponse.json({ slots: [] });

  const supabase = createAdminClient();
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);

  const { data: orders } = await supabase
    .from('orders')
    .select('scheduled_at, duration_minutes, status')
    .gte('scheduled_at', start.toISOString())
    .lte('scheduled_at', end.toISOString())
    .not('status', 'in', '("cancelled","draft")');

  const { data: blocks } = await supabase
    .from('schedule_blocks')
    .select('starts_at, ends_at, is_available')
    .gte('starts_at', start.toISOString())
    .lte('ends_at', end.toISOString())
    .eq('is_available', false);

  const busy: Array<[number, number]> = []; // unix-ms ranges
  for (const o of orders ?? []) {
    const sa = new Date((o as any).scheduled_at).getTime();
    const dur = ((o as any).duration_minutes ?? 60) * 60 * 1000;
    busy.push([sa, sa + dur]);
  }
  for (const b of blocks ?? []) {
    busy.push([new Date((b as any).starts_at).getTime(), new Date((b as any).ends_at).getTime()]);
  }

  const slots: string[] = [];
  for (let h = BUSINESS_HOURS.startHour; h < BUSINESS_HOURS.endHour; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      const t = new Date(day);
      t.setHours(h, m, 0, 0);
      const tEnd = t.getTime() + duration * 60 * 1000;
      const endHour = new Date(day).setHours(BUSINESS_HOURS.endHour, 0, 0, 0);
      if (tEnd > endHour) continue;
      const overlaps = busy.some(([s, e]) => t.getTime() < e && tEnd > s);
      if (!overlaps) slots.push(t.toISOString());
    }
  }

  return NextResponse.json({ slots, duration });
}
