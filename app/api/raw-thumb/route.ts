import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * RAW embedded-JPEG preview proxy (fresh route).
 *
 * Re-homed copy of /api/photos/raw-preview on a new path under /api/, for the
 * same reason as /api/raw-convert: the old function was returning a stale 401.
 * Used by the Stage 1 bracket cards to show ARW previews.
 */
export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const photoId = url.searchParams.get('photo_id');
  if (!photoId || !/^[0-9a-f-]{36}$/i.test(photoId)) {
    return NextResponse.json({ error: 'invalid_photo_id' }, { status: 400 });
  }

  const workerUrl = process.env.ARW_WORKER_URL;
  const workerSecret = process.env.ARW_WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    return NextResponse.json({ error: 'worker_not_configured' }, { status: 503 });
  }

  try {
    const r = await fetch(`${workerUrl}/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-secret': workerSecret },
      body: JSON.stringify({ photo_id: photoId }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return NextResponse.json({ error: data.error || `worker_${r.status}` }, { status: r.status });
    }
    const buf = await r.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'worker_unreachable', detail: err?.message || String(err) },
      { status: 502 }
    );
  }
}
