import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Returns a fast preview of an ARW/CR3/NEF/etc by extracting the embedded
 * camera JPEG via the ARW worker on Fly.io. Used by the Stage 1 bracket
 * cards so the photographer can see what they're approving before paying
 * the full demosaic cost.
 *
 * GET /api/photos/raw-preview?photo_id=<uuid>
 *   →  200 image/jpeg
 *   →  401 / 400 / 502 / 503 on errors
 *
 * The route streams the JPEG bytes directly from the worker — no
 * persistence. The browser caches via the worker's Cache-Control header.
 *
 * Timeout is set in vercel.json (`functions`), not via `export const
 * maxDuration` — that route-segment config makes the handler receive an empty
 * cookie store here, so getUser() returns null and the route 401s.
 */
export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (!user) {
    const { cookies } = await import('next/headers');
    const sbCookies = cookies()
      .getAll()
      .map((c) => c.name)
      .filter((n) => n.startsWith('sb-'));
    console.error('[raw-preview] unauthorized', {
      authError: authError?.message ?? null,
      authStatus: (authError as any)?.status ?? null,
      sbCookies,
    });
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
    return NextResponse.json(
      { error: 'worker_not_configured' },
      { status: 503 }
    );
  }

  try {
    const r = await fetch(`${workerUrl}/preview`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-secret': workerSecret,
      },
      body: JSON.stringify({ photo_id: photoId }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.error || `worker_${r.status}` },
        { status: r.status }
      );
    }
    const buf = await r.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'public, max-age=3600',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'worker_unreachable', detail: err?.message || String(err) },
      { status: 502 }
    );
  }
}
