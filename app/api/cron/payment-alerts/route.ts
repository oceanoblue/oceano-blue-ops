import { NextResponse } from 'next/server';
import { runPaymentAlerts } from '@/lib/payments/alerts';
import { captureError } from '@/lib/observability/report';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try { return NextResponse.json(await runPaymentAlerts()); }
  catch (error) {
    captureError('payments.ownerAlerts', error);
    return NextResponse.json({ error: 'payment_alert_processing_failed' }, { status: 500 });
  }
}
