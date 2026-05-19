import { NextResponse } from 'next/server';
import { cleanupExpiredRaws } from '@/lib/photos/cleanup-raws';

/**
 * Daily cleanup cron — wired in vercel.json. Vercel sends `Authorization:
 * Bearer <CRON_SECRET>`. Reject anything else.
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
    const result = await cleanupExpiredRaws();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'cron_failed' },
      { status: 500 }
    );
  }
}
