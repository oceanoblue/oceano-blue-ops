import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Podcast publish-approval gate (decision #2).
 *
 * The unlisted YouTube upload is an allowed draft; going public / finalizing
 * delivery requires this human approval. Approving marks the pending `approvals`
 * row + the `delivery_versions` row approved and the episode published.
 *
 * NOTE: actually flipping the YouTube video to public is a Phase 2 step (POS →
 * Make trigger). v1 records the human decision as the source of truth.
 */
const Body = z.object({
  episode_id: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  notes: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { episode_id, decision, notes } = parsed.data;
  const admin = createAdminClient() as any;
  const now = new Date().toISOString();

  const { data: ep } = await admin
    .from('podcast_episodes')
    .select('id, job_id')
    .eq('id', episode_id)
    .maybeSingle();
  if (!ep) return NextResponse.json({ error: 'episode_not_found' }, { status: 404 });

  const { data: appr } = await admin
    .from('approvals')
    .select('id')
    .eq('job_id', ep.job_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (decision === 'approve') {
    if (appr) {
      await admin.from('approvals').update({ status: 'approved', decided_by: user.id, decided_at: now, notes: notes ?? null }).eq('id', appr.id);
    }
    await admin
      .from('delivery_versions')
      .update({ status: 'approved', approved_by: user.id, approved_at: now })
      .eq('job_id', ep.job_id)
      .eq('delivery_type', 'podcast_episode');
    await admin.from('podcast_deliverables').update({ status: 'approved' }).eq('episode_id', ep.id);
    await admin.from('podcast_episodes').update({ status: 'published', next_action: null }).eq('id', ep.id);
    await admin.from('production_events').insert({
      job_id: ep.job_id,
      actor_type: 'user',
      actor_id: user.id,
      event_type: 'delivery_approved',
      summary: 'Podcast delivery approved for publishing',
    });
  } else {
    if (appr) {
      await admin.from('approvals').update({ status: 'rejected', decided_by: user.id, decided_at: now, notes: notes ?? null }).eq('id', appr.id);
    }
    await admin.from('podcast_episodes').update({ status: 'needs_revision', next_action: 'Address review feedback' }).eq('id', ep.id);
    await admin.from('production_events').insert({
      job_id: ep.job_id,
      actor_type: 'user',
      actor_id: user.id,
      event_type: 'delivery_rejected',
      summary: 'Podcast delivery sent back for revision',
      details: { notes: notes ?? null },
    });
  }

  return NextResponse.json({ ok: true });
}
