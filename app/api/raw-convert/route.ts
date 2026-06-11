import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

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
 */
const Body = z.object({ photo_id: z.string().uuid() });

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

  const parsed = Body.safeParse(await request.json());
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
      return NextResponse.json({ error: data.error || `worker_${r.status}` }, { status: r.status });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: 'worker_unreachable', detail: err?.message || String(err) },
      { status: 502 }
    );
  }
}
