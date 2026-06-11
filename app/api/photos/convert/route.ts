import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Proxy that forwards a RAW conversion request to the ARW worker on Fly.io.
 * The browser never talks to the worker directly — we authenticate the user
 * here, then attach the shared secret server-side.
 */
const Body = z.object({
  photo_id: z.string().uuid(),
});

// Fly cold-start (2-3s) + 50-100MB ARW download from Supabase (~3-5s) +
// dcraw decode (3-8s) + Sharp encode (~1s) + JPEG upload back (~2s) — full
// round trip can easily hit 60s. The 300s timeout is set in vercel.json
// (`functions`), NOT via `export const maxDuration` — that route-segment config
// makes the handler receive an empty cookie store on this Next/Vercel setup, so
// getUser() returns null and the route 401s.

export async function POST(request: Request) {
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
    console.error('[convert] unauthorized', {
      authError: authError?.message ?? null,
      authStatus: (authError as any)?.status ?? null,
      sbCookies,
    });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
      {
        error: 'worker_not_configured',
        hint: 'Set ARW_WORKER_URL and ARW_WORKER_SECRET in Vercel env vars',
      },
      { status: 503 }
    );
  }

  try {
    const r = await fetch(`${workerUrl}/convert`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-secret': workerSecret,
      },
      body: JSON.stringify({ photo_id: parsed.data.photo_id }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return NextResponse.json(
        { error: data.error || `worker_${r.status}` },
        { status: r.status }
      );
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: 'worker_unreachable', detail: err?.message || String(err) },
      { status: 502 }
    );
  }
}
