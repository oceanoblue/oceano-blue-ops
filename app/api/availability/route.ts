import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getAvailability } from '@/lib/booking/availability';
import { validDate } from '@/lib/booking/validation';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { captureError } from '@/lib/observability/report';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'availability', 60, 60);
  if (limited) return limited;
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || '';
  const duration = Number(url.searchParams.get('duration') || '60');
  if (!validDate(date) || !Number.isInteger(duration) || duration < 15 || duration > 720) {
    return NextResponse.json({ error: 'invalid_query', message: 'Choose a valid date and appointment duration.' }, { status: 400 });
  }
  const products=url.searchParams.get('products')?.split(',').filter(Boolean);
  const zip=url.searchParams.get('zip')||undefined;
  if ((products && !z.array(z.string().uuid()).max(30).safeParse(products).success) || (zip && !/^\d{5}(-\d{4})?$/.test(zip))) return NextResponse.json({error:'invalid_query'},{status:400});
  try {
    return NextResponse.json(await getAvailability(date, duration, undefined, {productIds:products,zip}), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    captureError('availability', error);
    return NextResponse.json({ error: 'availability_unavailable', message: 'We cannot verify availability right now. Please try again shortly or contact the office.' }, { status: 503 });
  }
}
