import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { persistDetectedGroups } from '@/lib/photos/persist-bracket-groups';

export const dynamic = 'force-dynamic';

/**
 * Re-run bracket detection over a job's currently-ungrouped photos (owner
 * action). Useful for assets indexed by the worker before auto-detection, or
 * after correcting/splitting groups. Only `status='indexed'` photos are
 * considered (grouped/rejected are left alone), so it's safe to run repeatedly.
 */
const Body = z.object({ job_id: z.string().uuid() });

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
    .select('id, filename, exif, created_at')
    .eq('job_id', job_id)
    .eq('media_type', 'photo')
    .eq('status', 'indexed');

  const likes = (assets ?? [])
    .filter((a: any) => a.filename)
    .map((a: any) => ({ id: a.id, filename: a.filename, exif: a.exif, created_at: a.created_at }));
  if (likes.length === 0) {
    return NextResponse.json({ ok: true, considered: 0, groups: 0, message: 'No ungrouped photos to detect.' });
  }

  const result = await persistDetectedGroups(admin, job_id, likes);

  await admin.from('production_events').insert({
    job_id,
    actor_type: 'user',
    actor_id: user.id,
    event_type: 'brackets_redetected',
    summary: `Re-detected brackets: ${result.groups} group(s), ${result.needs_review} need review`,
    details: { considered: likes.length, ...result },
  });

  return NextResponse.json({ ok: true, considered: likes.length, ...result });
}
