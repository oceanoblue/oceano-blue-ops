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
 * Phase 2: approval also fires the Make publish webhook (MAKE_PUBLISH_WEBHOOK_URL)
 * which flips the YouTube video from unlisted to public, then confirms back via
 * the `youtube.published` callback event. The human click here IS the owner
 * approval — nothing goes public without it. When the webhook isn't configured
 * (or the episode has no YouTube link), the decision is still recorded and the
 * response says so; clicking Approve again retries the flip.
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
    .select('id, job_id, podcast_shows(slug)')
    .eq('id', episode_id)
    .maybeSingle();
  if (!ep) return NextResponse.json({ error: 'episode_not_found' }, { status: 404 });
  const showSlug = (ep.podcast_shows as any)?.slug ?? null;

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
    // NOTE: next_action lives on jobs, not podcast_episodes — including it here
    // made this update fail silently and the episode pill never left needs_review.
    const { error: epErr } = await admin.from('podcast_episodes').update({ status: 'published' }).eq('id', ep.id);
    if (epErr) return NextResponse.json({ error: `episode_update_failed: ${epErr.message}` }, { status: 500 });
    if (ep.job_id) await admin.from('jobs').update({ next_action: null }).eq('id', ep.job_id);
    await admin.from('production_events').insert({
      job_id: ep.job_id,
      actor_type: 'user',
      actor_id: user.id,
      event_type: 'delivery_approved',
      summary: 'Podcast delivery approved for publishing',
    });

    // Phase 2: flip the YouTube video public via the Make publish scenario.
    const webhook = process.env.MAKE_PUBLISH_WEBHOOK_URL;
    const { data: yt } = await admin
      .from('external_links')
      .select('url, external_id')
      .eq('job_id', ep.job_id)
      .eq('link_type', 'youtube_video')
      .maybeSingle();

    let publish: 'triggered' | 'not_configured' | 'no_youtube' | 'failed' = 'not_configured';
    if (webhook && yt?.url) {
      const tr = (await admin
        .from('tool_runs')
        .insert({
          job_id: ep.job_id,
          tool_type: 'make_publish',
          provider: 'make',
          status: 'queued',
          input: { episode_id: ep.id, youtube_url: yt.url },
          created_by: user.id,
        })
        .select('id')
        .single()).data;
      // The publish scenario must echo pos_run_id back as make_execution_id so
      // youtube.published can close this tool_run.
      if (tr) await admin.from('tool_runs').update({ external_id: tr.id }).eq('id', tr.id);

      try {
        const res = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'publish_youtube',
            pos_run_id: tr?.id ?? null,
            episode_id: ep.id,
            show_slug: showSlug, // Router key — selects the client's YouTube connection
            youtube_url: yt.url,
            youtube_id: yt.external_id ?? null,
            privacy: 'public',
          }),
        });
        if (res.ok) {
          publish = 'triggered';
        } else {
          publish = 'failed';
          await admin.from('tool_runs').update({ status: 'failed', error: `make webhook ${res.status}` }).eq('id', tr?.id);
        }
      } catch (e: any) {
        publish = 'failed';
        await admin.from('tool_runs').update({ status: 'failed', error: e?.message ?? 'fetch_error' }).eq('id', tr?.id);
      }
    } else if (webhook && !yt?.url) {
      publish = 'no_youtube';
    }

    return NextResponse.json({ ok: true, publish });
  } else {
    if (appr) {
      await admin.from('approvals').update({ status: 'rejected', decided_by: user.id, decided_at: now, notes: notes ?? null }).eq('id', appr.id);
    }
    const { error: epErr } = await admin.from('podcast_episodes').update({ status: 'needs_revision' }).eq('id', ep.id);
    if (epErr) return NextResponse.json({ error: `episode_update_failed: ${epErr.message}` }, { status: 500 });
    if (ep.job_id) await admin.from('jobs').update({ next_action: 'Address review feedback' }).eq('id', ep.job_id);
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
