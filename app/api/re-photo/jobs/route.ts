import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Minimal job creator for the Real Estate Photo Rescue flow, so the feature is
 * usable end-to-end before generic create/edit forms land. Creates a job of
 * type `real_estate_photo`. (Full job/project/client creation UI is a separate
 * Phase 2 task.)
 */
const Body = z.object({
  title: z.string().min(1).max(200),
  client_id: z.string().uuid().optional(),
});

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
  const admin = createAdminClient() as any;

  const { data: jobType } = await admin
    .from('job_types')
    .select('id')
    .eq('key', 'real_estate_photo')
    .maybeSingle();

  const { data: job, error } = await admin
    .from('jobs')
    .insert({
      title: parsed.data.title,
      client_id: parsed.data.client_id ?? null,
      job_type_id: jobType?.id ?? null,
      status: 'media_received',
      next_action: 'Ingest photos',
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error || !job) return NextResponse.json({ error: error?.message ?? 'create_failed' }, { status: 500 });

  await admin.from('production_events').insert({
    job_id: job.id,
    actor_type: 'user',
    actor_id: user.id,
    event_type: 'job_created',
    summary: `Created real estate photo job: ${parsed.data.title}`,
  });

  return NextResponse.json({ ok: true, job_id: job.id });
}
