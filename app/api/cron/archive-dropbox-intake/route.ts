import { NextResponse } from 'next/server';
import { archiveDeliveredIntakeFolders } from '@/lib/photos/archive-dropbox-intake';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Archive long-delivered orders' Dropbox intake folders. Runs daily piggybacked
 * on /api/cron/cleanup-raws (to stay within the Vercel cron limit); also exposed
 * standalone here for manual triggering / testing. Auth: Bearer CRON_SECRET.
 */
async function handle(request: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization');
  if (!expected || provided !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await archiveDeliveredIntakeFolders();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
