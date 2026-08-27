import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * DEPRECATED. This route used to queue `process_photos` tasks for the local/NAS
 * worker, which has been retired. Photo merge + enhance now runs in the cloud AI
 * pipeline — use "Process from Dropbox" (POST /api/re-photo/process-dropbox),
 * which enqueues ai_jobs (worker-edit HDR merge → Nano Banana enhance).
 *
 * Kept as a 410 so nothing can create a NAS task that would queue forever.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'deprecated', message: 'Photo processing has moved to the cloud. Use "Process from Dropbox".' },
    { status: 410 }
  );
}
