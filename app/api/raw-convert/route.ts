import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * RAW → JPEG conversion proxy (fresh route).
 *
 * This is a re-homed copy of /api/photos/convert on a new path. The old route
 * kept returning a stale 401 — Vercel appears to have been serving a cached
 * build of that function (it once had a custom maxDuration config). A brand-new
 * path is a brand-new function that can't be stale, and living under /api/
 * (not /api/photos) also rules out any path-scoped issue, since sibling routes
 * like /api/ai/status authenticate fine.
 *
 * Authenticates the user, then proxies to the ARW worker with the shared secret.
 * The 401 carries a cookie diagnostic so we can see if auth cookies arrive.
 *
 * Idempotent: if a converted JPEG sibling already exists (e.g. the gateway
 * timed out but the worker finished in the background), it's returned
 * immediately — so client retries always converge.
 */
const Body = z.object({ photo_id: z.string().uuid() });

const RAW_EXT = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;

// A full ARW round trip (download from storage + dcraw decode + encode +
// upload) can take well over the default function timeout — the gateway was
// returning 504 mid-conversion. This is a freshly-built function, so this is
// also the clean test of whether maxDuration itself ever broke cookie auth
// (the old 401s are now attributed to a stale function build).
export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (!user) {
    const { cookies } = await import('next/headers');
    const all = cookies().getAll();
    const sb = all.filter((c) => c.name.startsWith('sb-')).length;
    const err = authError?.message ? ` ${authError.message}` : '';
    return NextResponse.json(
      { error: `unauthorized [cookies:${all.length} sb:${sb}]${err}` },
      { status: 401 }
    );
  }

  const parsed0 = Body.safeParse(await request.json());
  if (parsed0.success) {
    // Already converted (possibly by a previous attempt that the gateway cut
    // off)? Return the JPEG sibling without re-running the worker.
    const { data: siblings } = await (supabase.from('photos') as any)
      .select('id, filename')
      .eq('parent_photo_id', parsed0.data.photo_id)
      .eq('kind', 'raw')
      .limit(10);
    const jpeg = (siblings ?? []).find((s: any) => !RAW_EXT.test(s.filename));
    if (jpeg) return NextResponse.json({ photo_id: jpeg.id, already_converted: true });
  }
  const parsed = parsed0;
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const workerUrl = process.env.ARW_WORKER_URL;
  const workerSecret = process.env.ARW_WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    return NextResponse.json(
      { error: 'worker_not_configured', hint: 'Set ARW_WORKER_URL and ARW_WORKER_SECRET in Vercel env vars' },
      { status: 503 }
    );
  }

  try {
    const r = await fetch(`${workerUrl}/convert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-secret': workerSecret },
      body: JSON.stringify({ photo_id: parsed.data.photo_id }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = String(data.error || `worker_${r.status}`);
      // The original RAW isn't in storage — its upload never finished (e.g. a
      // failed resumable chunk left a photo row with no object). We only reach
      // here AFTER the JPEG-sibling check above found nothing, so this is a
      // confirmed dead orphan. Self-heal: delete the row so it stops resurfacing
      // in the client / eager-converter, and return a clear, actionable error
      // (no more cryptic, recurring "download_failed: Object not found").
      if (/object not found|download_failed|not.?found/i.test(msg)) {
        await createAdminClient()
          .from('photos')
          .delete()
          .eq('id', parsed.data.photo_id)
          .eq('kind', 'raw');
        return NextResponse.json(
          {
            error: 'source_missing',
            removed: true,
            hint: 'This file never finished uploading, so there was no original to convert — the dead entry has been cleared. Re-upload the original frame if you need it.',
          },
          { status: 422 }
        );
      }
      return NextResponse.json({ error: msg }, { status: r.status });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: 'worker_unreachable', detail: err?.message || String(err) },
      { status: 502 }
    );
  }
}
