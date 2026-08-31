import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Create a DRAFT delivery version for a job (owner action). Internal
 * record-keeping only — this does not send anything to a client or publish
 * publicly; the actual gallery/upload lives in the external tool (Pixieset /
 * Frame.io / Vimeo / Drive) and POS just tracks its URL + state. Promoting to
 * delivered/published is a separate, explicit owner action (see /update).
 */
const DELIVERY_TYPES = [
  'photo_gallery', 'download_zip', 'video_draft', 'video_final',
  'podcast_episode', 'podcast_clip', 'caption_file', 'thumbnail',
  'show_notes', 'social_caption_package', 'archive_package',
] as const;

const Body = z.object({
  job_id: z.string().uuid(),
  delivery_type: z.enum(DELIVERY_TYPES),
  title: z.string().max(200).optional(),
  external_url: z.string().url().optional().or(z.literal('')),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: isStaff } = await supabase.rpc('is_team_member');
  if (!isStaff) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const admin = createAdminClient() as any;

  // Next version number for this job's delivery type.
  const { data: prev } = await admin
    .from('delivery_versions')
    .select('version_number')
    .eq('job_id', parsed.data.job_id)
    .eq('delivery_type', parsed.data.delivery_type)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (prev?.version_number ?? 0) + 1;

  const { data: delivery, error } = await admin
    .from('delivery_versions')
    .insert({
      job_id: parsed.data.job_id,
      delivery_type: parsed.data.delivery_type,
      status: 'draft',
      version_number: version,
      title: parsed.data.title ?? null,
      external_url: parsed.data.external_url || null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error || !delivery) return NextResponse.json({ error: error?.message ?? 'create_failed' }, { status: 500 });

  await admin.from('production_events').insert({
    job_id: parsed.data.job_id,
    actor_type: 'user',
    actor_id: user.id,
    event_type: 'delivery_created',
    summary: `Created ${parsed.data.delivery_type.replace(/_/g, ' ')} draft (v${version})`,
    details: { delivery_id: delivery.id },
  });

  return NextResponse.json({ ok: true, delivery_id: delivery.id, version_number: version });
}
