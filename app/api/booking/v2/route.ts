import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { BookingBody, productDuration } from '@/lib/booking/validation';
import { getAvailability } from '@/lib/booking/availability';
import { fmtDateInTz } from '@/lib/utils/timezone';
import { captureError } from '@/lib/observability/report';

export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'booking_v2', 5, 600);
  if (limited) return limited;
  const parsed = BookingBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed', message: 'Please check your booking details.' }, { status: 400 });
  const key = request.headers.get('Idempotency-Key') || randomUUID();
  if (!z.string().uuid().safeParse(key).success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const b = parsed.data;
  const hash = createHash('sha256').update(JSON.stringify(b)).digest('hex');
  const admin = createAdminClient() as any;
  try {
    // A lost response can be retried even after the booked slot is no longer free.
    const { data: existing, error: lookupError } = await admin.from('booking_requests').select('request_hash, order_id').eq('id', key).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      if (existing.request_hash !== hash) return NextResponse.json({ error: 'idempotency_conflict', message: 'This request changed. Please review the booking and try again.' }, { status: 409 });
      return NextResponse.json({ order_id: existing.order_id });
    }
    const audience = ['architectural', 'interior_design'].includes(b.project_type) ? 'architectural' : 'real_estate';
    const { data: products, error: productError } = await admin.from('products').select('id, duration_minutes')
      .in('id', b.items.map(item => item.product_id)).eq('is_active', true).contains('audiences', [audience]);
    if (productError) throw productError;
    let duration: number;
    try { duration = productDuration(b.items, products || []); }
    catch { return NextResponse.json({ error: 'invalid_product', message: 'Your selected services changed. Please choose your services again.' }, { status: 400 }); }
    const { data: settings, error: settingsError } = await admin.from('business_settings').select('default_timezone').eq('id', true).maybeSingle();
    if (settingsError) throw settingsError;
    const date = fmtDateInTz(b.scheduled_at, settings?.default_timezone || 'America/New_York', 'iso');
    const available = await getAvailability(date, duration, b.photographer_id);
    if (!available.slots.some(slot => Date.parse(slot.iso) === Date.parse(b.scheduled_at))) {
      return NextResponse.json({ error: available.calendarDegraded ? 'availability_unavailable' : 'slot_unavailable', message: available.calendarDegraded
        ? 'We cannot verify this photographer’s calendar. Please try later or contact the office.'
        : 'That time is no longer available. Please choose another time.' }, { status: available.calendarDegraded ? 503 : 409 });
    }
    const { data: orderId, error } = await admin.rpc('commit_public_booking', {
      p_payload: { ...b, duration_minutes: duration }, p_request_id: key, p_request_hash: hash,
    });
    if (error) {
      if (error.code === '23P01') return NextResponse.json({ error: 'slot_unavailable', message: 'That time was just taken. Please choose another time.' }, { status: 409 });
      if (error.message?.includes('idempotency_conflict')) return NextResponse.json({ error: 'idempotency_conflict', message: 'This request changed. Please review it and try again.' }, { status: 409 });
      throw error;
    }
    // Calendar/email/SMS follow-ups were committed atomically and are processed
    // by cron. A provider outage cannot lose the booking or its notifications.
    return NextResponse.json({ order_id: orderId });
  } catch (error) {
    captureError('booking.commit', error);
    return NextResponse.json({ error: 'booking_unavailable', message: 'We could not confirm your booking. Please try again shortly; your details are saved.' }, { status: 503 });
  }
}
