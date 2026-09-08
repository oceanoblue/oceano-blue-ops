import { NextResponse } from 'next/server';
import { runBookingFollowups } from '@/lib/booking/followups';
import { captureError } from '@/lib/observability/report';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try { return NextResponse.json({ results: await runBookingFollowups() }); }
  catch (error) {
    captureError('booking.followups', error);
    return NextResponse.json({ error: 'followup_processing_failed' }, { status: 500 });
  }
}
