import { NextResponse } from 'next/server';
import { mirrorGuestRsvps } from '@/lib/google-calendar/mirror-rsvp';

/**
 * Cron (vercel.json): copy a photographer's Yes / No on the Google Calendar
 * invite into the app's accept / decline. Vercel sends `Authorization: Bearer
 * <CRON_SECRET>`; reject anything else.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization');
  if (!expected || provided !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const result = await mirrorGuestRsvps({ baseUrl: base });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'cron_failed' }, { status: 500 });
  }
}
