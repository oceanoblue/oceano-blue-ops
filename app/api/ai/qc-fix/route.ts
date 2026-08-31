import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { resolveRerun, withCorrection } from '@/lib/ai/rerun-resolve';
import { getProvider } from '@/lib/ai';

/**
 * POST /api/ai/qc-fix  { order_id }
 *
 * "Fix all flagged" — re-renders every photo flagged by the latest consistency
 * check, from its ORIGINAL frame, with a targeted white-balance / exposure /
 * material-color correction derived from that photo's flags. Non-destructive
 * (each produces a new output) and only touches flagged photos.
 */
export const dynamic = 'force-dynamic';

const Body = z.object({ order_id: z.string().uuid() });

/** Build a corrective editor note from a stored QC finding. */
function correctionFromFinding(f: any): string {
  const parts: string[] = [];
  const flags: string[] = f?.consistency?.flags ?? [];
  if (flags.includes('warm'))
    parts.push('This frame reads too warm/yellow versus the rest of the set — cool the white balance toward a clean neutral daylight so ceilings, trim and walls read true-white.');
  if (flags.includes('cool'))
    parts.push('This frame reads too cool/blue versus the rest of the set — warm the white balance slightly toward a neutral, inviting daylight to match the others.');
  if (flags.includes('green')) parts.push('Remove a green color cast; bring neutrals back to true-neutral.');
  if (flags.includes('magenta')) parts.push('Remove a magenta/pink color cast; bring neutrals back to true-neutral.');
  if (flags.includes('bright')) parts.push('This frame is brighter than the set — bring overall exposure down to match the others.');
  if (flags.includes('dark')) parts.push('This frame is darker than the set — lift overall exposure to match the others.');
  if (f?.ai?.wall_drift)
    parts.push('Restore the original material colors EXACTLY — walls, ceilings, trim, cabinetry and floors must match the original capture; do not recolor any surface, only correct white balance and exposure.');
  if (f?.ai && f.ai.white_balance_ok === false)
    parts.push('Neutralize the white balance to a single, clean daylight-neutral temperature across the whole image.');
  parts.push('Keep the property exactly as-is for consistency with the rest of the set.');
  return parts.join(' ');
}

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

  const admin = createAdminClient() as any;

  // Latest consistency report for this order.
  const { data: report } = await admin
    .from('photo_qc_reports')
    .select('id, findings')
    .eq('order_id', order_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const findings: any[] = (report?.findings as any[]) ?? [];
  if (!findings.length) {
    return NextResponse.json({ queued: [], message: 'Nothing flagged — run a consistency check first.' });
  }

  const rows: any[] = [];
  const skipped: string[] = [];
  for (const f of findings) {
    const resolved = await resolveRerun(admin, f.photo_id);
    if ('error' in resolved) {
      skipped.push(f.photo_id);
      continue;
    }
    const provider = getProvider((resolved.recipe.provider as any) ?? 'auto', resolved.recipe.job_type);
    if (!provider.isConfigured()) {
      skipped.push(f.photo_id);
      continue;
    }
    const recipe = withCorrection(resolved.recipe, correctionFromFinding(f));
    rows.push({
      order_id: resolved.orderId,
      job_type: recipe.job_type,
      provider: provider.id,
      input_photo_ids: resolved.inputs,
      prompt: recipe.prompt,
      status: 'pending' as const,
      created_by: user.id,
      params: { recipe, qc_fix: true, fixed_photo: f.photo_id, qc_report_id: report?.id ?? null },
    });
  }

  if (!rows.length) {
    return NextResponse.json(
      { queued: [], skipped, error: 'nothing_fixable', message: 'Could not resolve recipes for the flagged photos.' },
      { status: 422 }
    );
  }

  const { data: jobs, error: insErr } = await admin.from('ai_jobs').insert(rows).select('id');
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

  return NextResponse.json({ queued: (jobs ?? []).map((j: any) => j.id), skipped });
}
