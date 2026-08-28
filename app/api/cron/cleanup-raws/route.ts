import { NextResponse } from 'next/server';
import { cleanupExpiredRaws } from '@/lib/photos/cleanup-raws';
import { archiveDeliveredIntakeFolders } from '@/lib/photos/archive-dropbox-intake';

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
    // Piggyback the daily Dropbox intake archival here (keeps us within the
    // Vercel cron limit). Best-effort — never fail the RAW cleanup over it.
    let archive: unknown = null;
    try {
      archive = await archiveDeliveredIntakeFolders();
    } catch (archiveErr: any) {
      archive = { error: archiveErr?.message || 'archive_failed' };
    }
    return NextResponse.json({ ...result, dropbox_archive: archive });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'cron_failed' },
      { status: 500 }
    );
  }
}
