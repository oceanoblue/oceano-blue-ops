import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getProvider } from '@/lib/ai';
import { buildAutoEnhanceJobRow } from '@/lib/ai/auto-enhance';

/**
 * POST /api/ai/auto-enhance  { order_id }
 *
 * Auto-enhance on upload — the STANDALONE SINGLES path. (Merged HDR bases are
 * auto-enhanced server-side by the runner when their hdr_merge completes.)
 *
 * Called when the photographer reaches Stage 2, i.e. once triage is done. It
 * enqueues a signature enhance (+ scene auto-chain) for every JPEG single that
 * is genuinely standalone and not yet enhanced. Fully idempotent — safe to call
 * repeatedly (on every Stage-2 entry) without double-spending:
 *
 *   eligible single = kind 'raw', non-RAW extension (a real JPEG), AND
 *     - NOT fed to any hdr_merge job for this order (i.e. not a bracket frame)
 *     - NOT already targeted by an enhance_single job
 *     - has no processed/delivered child (not already enhanced)
 *
 * No-ops (returns queued: []) when the setting is off or nothing is eligible.
 */
const Body = z.object({ order_id: z.string().uuid() });

const RAW_EXT = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { order_id } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: isStaff } = await supabase.rpc('is_team_member');
  if (!isStaff) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient();

  // Respect the org setting (default on).
  const { data: bs } = await admin
    .from('business_settings')
    .select('auto_enhance_on_upload, auto_scene_fixes')
    .eq('id', true)
    .maybeSingle();
  if ((bs as any)?.auto_enhance_on_upload === false) {
    return NextResponse.json({ queued: [], reason: 'disabled' });
  }
  const sceneFixes = (bs as any)?.auto_scene_fixes !== false; // default on

  // Candidate singles: JPEG raw-kind frames for this order.
  const { data: photos } = await admin
    .from('photos')
    .select('id, filename, kind, parent_photo_id')
    .eq('order_id', order_id)
    .eq('kind', 'raw');
  const candidates = ((photos ?? []) as any[]).filter((p) => !RAW_EXT.test(p.filename));
  if (!candidates.length) return NextResponse.json({ queued: [] });
  const candidateIds = new Set<string>(candidates.map((p) => p.id));

  // Exclude bracket frames (anything fed to an hdr_merge) and anything already
  // being enhanced — the ground truth, no fragile re-detection.
  const { data: jobs } = await admin
    .from('ai_jobs')
    .select('job_type, input_photo_ids')
    .eq('order_id', order_id)
    .in('job_type', ['hdr_merge', 'enhance_single']);
  const excluded = new Set<string>();
  for (const j of (jobs ?? []) as any[]) {
    for (const id of (j.input_photo_ids ?? []) as string[]) excluded.add(id);
  }

  // Exclude singles that already have an enhanced child.
  const { data: children } = await admin
    .from('photos')
    .select('parent_photo_id')
    .eq('order_id', order_id)
    .in('kind', ['processed', 'delivered']);
  for (const c of (children ?? []) as any[]) {
    if (c.parent_photo_id) excluded.add(c.parent_photo_id);
  }

  const eligible = candidates.filter((p) => candidateIds.has(p.id) && !excluded.has(p.id));
  if (!eligible.length) return NextResponse.json({ queued: [] });

  const enhanceProvider = getProvider('auto', 'enhance_single');
  if (!enhanceProvider.isConfigured()) {
    return NextResponse.json(
      { error: 'not_configured', provider: enhanceProvider.id },
      { status: 400 }
    );
  }

  const rows = eligible.map((p) =>
    buildAutoEnhanceJobRow({
      orderId: order_id,
      baseId: p.id,
      providerId: enhanceProvider.id,
      createdBy: user.id,
      sceneFixes,
    })
  );
  const { data: inserted, error: insErr } = await admin.from('ai_jobs').insert(rows).select('id');
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  await admin.from('orders').update({ status: 'processing' }).eq('id', order_id);

  // Kick the background worker.
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  const secret = process.env.CRON_SECRET;
  if (base && secret) {
    const url = base.startsWith('http') ? base : `https://${base}`;
    fetch(`${url}/api/cron/run-pending-jobs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    }).catch(() => {});
  }

  return NextResponse.json({ queued: (inserted ?? []).map((j: any) => j.id) });
}
