import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Real Estate Photo Rescue — delivery QC report.
 *
 * Produces a `qc_reports` row (qc_type = real_estate_photo_qc). A handful of
 * checks are computed automatically from the indexed assets/groups; the visual
 * checks from the master doc (neutral whites, vertical lines, believable
 * windows, etc.) are recorded as `pending` for a human to confirm. The quality
 * score reflects only the automatable checks for now.
 */
const Body = z.object({ job_id: z.string().uuid() });

type Check = { key: string; label: string; status: 'passed' | 'failed' | 'needs_review' | 'pending'; auto: boolean; detail?: string };

const MANUAL_CHECKS: Array<{ key: string; label: string }> = [
  { key: 'neutral_whites', label: 'Neutral whites' },
  { key: 'vertical_lines', label: 'Straight vertical lines' },
  { key: 'believable_windows', label: 'Believable windows' },
  { key: 'natural_skies', label: 'Natural skies' },
  { key: 'no_fake_hdr', label: 'No fake HDR look' },
  { key: 'no_halos', label: 'No halos' },
  { key: 'no_color_cast', label: 'No green/magenta cast' },
  { key: 'interior_temperature', label: 'Interiors not overly warm/cool' },
  { key: 'no_blur', label: 'No blurry photos' },
  { key: 'correct_export_sizes', label: 'Correct export sizes' },
];

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: isTeam } = await supabase.rpc('is_team_member');
  if (!isTeam) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { job_id } = parsed.data;
  const admin = createAdminClient() as any;

  const { data: assets } = await admin
    .from('assets')
    .select('id, filename, status, exif, asset_type')
    .eq('job_id', job_id);
  const { data: groups } = await admin
    .from('asset_groups')
    .select('id, review_required')
    .eq('job_id', job_id);

  const all = (assets ?? []).filter((a: any) => a.asset_type !== 'processed');
  const grps = groups ?? [];
  const active = all.filter((a: any) => a.status !== 'rejected');

  // --- automated checks ---
  const checks: Check[] = [];

  checks.push({
    key: 'all_files_indexed',
    label: 'All files indexed',
    status: all.length > 0 ? 'passed' : 'failed',
    auto: true,
    detail: `${all.length} assets indexed`,
  });

  // Duplicate filenames (case-insensitive).
  const seen = new Map<string, number>();
  for (const a of all) {
    const k = (a.filename ?? '').toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  checks.push({
    key: 'no_duplicates',
    label: 'No duplicate filenames',
    status: dupes.length === 0 ? 'passed' : 'failed',
    auto: true,
    detail: dupes.length ? `${dupes.length} duplicate name(s)` : 'No duplicates',
  });

  // Bracket groups all reviewed.
  const unreviewed = grps.filter((g: any) => g.review_required).length;
  checks.push({
    key: 'brackets_reviewed',
    label: 'All bracket groups reviewed',
    status: grps.length === 0 ? 'needs_review' : unreviewed === 0 ? 'passed' : 'needs_review',
    auto: true,
    detail: grps.length === 0 ? 'No groups detected yet' : `${unreviewed} group(s) still need review`,
  });

  // Metadata coverage.
  const withExif = active.filter((a: any) => a.exif && Object.keys(a.exif).length > 0).length;
  const coverage = active.length ? withExif / active.length : 0;
  checks.push({
    key: 'metadata_present',
    label: 'EXIF metadata present',
    status: active.length === 0 ? 'needs_review' : coverage >= 0.8 ? 'passed' : 'needs_review',
    auto: true,
    detail: `${withExif}/${active.length} active assets have EXIF`,
  });

  // --- manual visual checks ---
  for (const m of MANUAL_CHECKS) {
    checks.push({ key: m.key, label: m.label, status: 'pending', auto: false });
  }

  const auto = checks.filter((c) => c.auto);
  const autoPassed = auto.filter((c) => c.status === 'passed').length;
  const qualityScore = auto.length ? Math.round((autoPassed / auto.length) * 100) : 0;

  const anyFailed = auto.some((c) => c.status === 'failed');
  const anyOpen = checks.some((c) => c.status === 'needs_review' || c.status === 'pending');
  const status = anyFailed ? 'failed' : anyOpen ? 'needs_review' : 'passed';

  const { data: report, error } = await admin
    .from('qc_reports')
    .insert({
      job_id,
      qc_type: 'real_estate_photo_qc',
      status,
      quality_score: qualityScore,
      checks,
      notes: `Auto checks: ${autoPassed}/${auto.length} passed. ${MANUAL_CHECKS.length} visual checks pending human review.`,
      reviewed_by: user.id,
    })
    .select('id, status, quality_score')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from('production_events').insert({
    job_id,
    actor_type: 'user',
    actor_id: user.id,
    event_type: 'qc_report_created',
    summary: `Delivery QC: ${status} (${qualityScore}%)`,
    details: { qc_report_id: report.id, status, quality_score: qualityScore },
  });

  return NextResponse.json({ ok: true, report });
}
