import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { parseJsonLenient } from '@/lib/automations/lenient-json';
import { advancesEpisodeStatus } from '@/lib/podcasts/constants';

export const dynamic = 'force-dynamic';

/**
 * Podcast Production Engine v1 — Make.com → Production OS callback.
 *
 * Make stays the runtime/executor; this endpoint records canonical state in POS
 * (the source of truth). Server-to-server, authenticated with a shared secret
 * header `x-pos-automation-secret` (env POS_AUTOMATION_SECRET) — NOT a user
 * session. All writes use the service-role client.
 *
 * Locked decisions reflected here:
 *  #1 Dual-write: Make keeps updating Airtable; we store `airtable_record_id`
 *     in episode metadata for reconciliation.
 *  #2 Auto YouTube upload as *unlisted* is an allowed draft (delivery stays
 *     `internal_review`); going public/final requires a human approval — so the
 *     `youtube.uploaded` event opens a pending `approvals` row (publish gate).
 *  #4 Transcript is stored in `transcripts` (source of truth) and linked as a
 *     `podcast_deliverables` row; Dropbox is only a `storage_locations` entry.
 *
 * Events: intake | transcription.completed | copy.generated | youtube.uploaded
 *         | delivered | scenario.failed
 */
const Body = z.object({
  scenario: z.string().default('podcast_publish'),
  event: z.enum([
    'intake',
    'transcription.completed',
    'copy.generated',
    'youtube.uploaded',
    'youtube.published', // Phase 2: Make confirms the video was flipped public
    'transistor.uploaded', // audio draft created on Transistor (awaiting approval)
    'delivered',
    'scenario.failed',
  ]),
  make_execution_id: z.string().min(1),
  episode_id: z.string().uuid().nullable().optional(),
  output: z.record(z.any()).optional().default({}),
  error: z.record(z.any()).nullable().optional(),
});

export async function POST(request: Request) {
  const secret = process.env.POS_AUTOMATION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'callback_not_configured' }, { status: 503 });
  }
  // Constant-time comparison (hash both sides so lengths always match).
  const presented = request.headers.get('x-pos-automation-secret') ?? '';
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(secret).digest();
  if (!timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Make interpolates LLM copy into a raw JSON template, so multiline values
  // arrive with bare newlines; parse leniently and answer 400 (not an
  // unhandled 500) when the body is beyond repair.
  let rawBody: unknown;
  try {
    rawBody = parseJsonLenient(await request.text());
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = Body.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { event, make_execution_id, output } = parsed.data;
  const admin = createAdminClient() as any;

  const logEvent = (
    job_id: string | null,
    actor_type: string,
    event_type: string,
    summary: string,
    details: Record<string, unknown> = {}
  ) =>
    admin.from('production_events').insert({
      job_id,
      actor_type,
      event_type,
      summary,
      details: { make_execution_id, ...details },
    });

  // Resolve the episode (+ its job) for non-intake events.
  async function resolveEpisode(episodeId?: string | null) {
    if (episodeId) {
      const { data } = await admin
        .from('podcast_episodes')
        .select('id, job_id, metadata')
        .eq('id', episodeId)
        .maybeSingle();
      if (data) return data;
    }
    const { data } = await admin
      .from('podcast_episodes')
      .select('id, job_id, metadata')
      .contains('metadata', { make_execution_id })
      .maybeSingle();
    return data ?? null;
  }

  // Monotonic status writes: replayed/duplicate events never demote an episode
  // (e.g. a re-run's transcription.completed after copy already landed).
  async function advanceEpisode(epId: string, next: string, patch: Record<string, unknown> = {}) {
    const { data: cur } = await admin.from('podcast_episodes').select('status').eq('id', epId).maybeSingle();
    if (!advancesEpisodeStatus(cur?.status, next)) {
      if (Object.keys(patch).length > 0) await admin.from('podcast_episodes').update(patch).eq('id', epId);
      return false;
    }
    await admin.from('podcast_episodes').update({ status: next, ...patch }).eq('id', epId);
    return true;
  }

  try {
    switch (event) {
      case 'intake': {
        // Idempotency: one episode per make_execution_id. On a repeat (re-run or
        // a Dropbox rename that re-triggers the watcher) we return the existing
        // episode AND whether it already has a YouTube upload, so the Make
        // pipeline can skip re-uploading the same video (dedupe guard).
        const { data: existing } = await admin
          .from('podcast_episodes')
          .select('id, job_id')
          .contains('metadata', { make_execution_id })
          .maybeSingle();
        if (existing) {
          const { data: ytLink } = await admin
            .from('external_links')
            .select('url, external_id')
            .eq('job_id', existing.job_id)
            .eq('link_type', 'youtube_video')
            .maybeSingle();
          return NextResponse.json({
            ok: true,
            idempotent: true,
            episode_id: existing.id,
            job_id: existing.job_id,
            already_uploaded: Boolean(ytLink?.url),
            youtube_url: ytLink?.url ?? null,
            youtube_id: ytLink?.external_id ?? null,
          });
        }

        const show_slug = String(output.show_slug ?? '').trim();
        if (!show_slug) return NextResponse.json({ error: 'show_slug_required' }, { status: 400 });

        // Upsert the show by slug (registry lives in POS). Shows created in the
        // dashboard carry client + language + branding; auto-created get defaults.
        const SHOW_COLS = 'id, name, client_id, default_language, mood, tone, tagline, hosts, description, publishing_platforms, transistor_show_id';
        let show = (await admin
          .from('podcast_shows')
          .select(SHOW_COLS)
          .eq('slug', show_slug)
          .maybeSingle()).data;
        if (!show) {
          show = (await admin
            .from('podcast_shows')
            .insert({ slug: show_slug, name: show_slug, default_language: 'en' })
            .select(SHOW_COLS)
            .single()).data;
        }

        const jobType = (await admin.from('job_types').select('id').eq('key', 'podcast_episode').maybeSingle()).data;
        const job = (await admin
          .from('jobs')
          .insert({
            title: output.filename ?? show_slug,
            job_type_id: jobType?.id ?? null,
            client_id: show.client_id ?? null,
            language: show.default_language ?? 'en',
            status: 'ingesting',
            next_action: 'Transcribe + generate copy',
          })
          .select('id, project_id')
          .single()).data;

        // Dropbox is a storage location, not the source of truth (decision #4).
        let loc = (await admin.from('storage_locations').select('id').eq('kind', 'dropbox').eq('name', 'Dropbox').maybeSingle()).data;
        if (!loc) {
          loc = (await admin.from('storage_locations').insert({ name: 'Dropbox', kind: 'dropbox' }).select('id').single()).data;
        }

        const asset = (await admin
          .from('assets')
          .insert({
            job_id: job.id,
            asset_type: 'source',
            media_type: 'video',
            status: 'indexed',
            filename: output.filename ?? null,
            local_path: output.dropbox_path ?? null,
            external_url: output.dropbox_share_url ?? null,
            storage_location_id: loc.id,
            metadata: { source: 'podcast_make' },
          })
          .select('id')
          .single()).data;

        const episode = (await admin
          .from('podcast_episodes')
          .insert({
            show_id: show.id,
            job_id: job.id,
            title: output.filename ?? null,
            language: show.default_language ?? 'en',
            status: 'ingested',
            recorded_at: output.recorded_at ?? null,
            metadata: {
              make_execution_id,
              season_episode: output.season_episode ?? null,
              dropbox_path: output.dropbox_path ?? null,
              filename: output.filename ?? null,
              airtable_record_id: output.airtable_record_id ?? null, // dual-write bridge (#1)
            },
          })
          .select('id')
          .single()).data;

        const tr = (await admin
          .from('tool_runs')
          .insert({
            job_id: job.id,
            tool_type: 'make_scenario',
            provider: 'make',
            status: 'running',
            external_id: make_execution_id,
            input: { scenario: 'podcast_publish', show_slug },
          })
          .select('id')
          .single()).data;

        await logEvent(job.id, 'make', 'episode_created', `Podcast intake: ${output.filename ?? show_slug}`, { show_slug });
        return NextResponse.json({
          ok: true,
          episode_id: episode.id,
          job_id: job.id,
          asset_id: asset.id,
          parent_tool_run_id: tr.id,
          already_uploaded: false, // brand-new episode — pipeline should upload
          // Distribution flags so the pipeline knows which branches to run.
          distribution: {
            youtube: (show.publishing_platforms ?? []).includes('youtube') || (show.publishing_platforms ?? []).length === 0,
            audio: (show.publishing_platforms ?? []).includes('audio'),
            transistor_show_id: show.transistor_show_id ?? null,
          },
          // Branding for the AI copy step (Make passes these into the Claude prompt).
          show: {
            name: show.name ?? show_slug,
            language: show.default_language ?? 'en',
            mood: show.mood ?? null,
            tone: show.tone ?? null,
            tagline: show.tagline ?? null,
            hosts: show.hosts ?? null,
            description: show.description ?? null,
          },
        });
      }

      case 'transcription.completed': {
        const ep = await resolveEpisode(parsed.data.episode_id);
        if (!ep) return NextResponse.json({ error: 'episode_not_found' }, { status: 404 });

        const { data: existing } = await admin.from('transcripts').select('id').eq('episode_id', ep.id).maybeSingle();
        if (!existing) {
          await admin.from('transcripts').insert({
            job_id: ep.job_id,
            episode_id: ep.id,
            provider: 'assemblyai',
            language: output.language ?? 'en',
            text: output.transcript_text ?? null,
            speakers: output.speakers ?? [],
            metadata: { assemblyai_id: output.assemblyai_id ?? null, chapters: output.chapters ?? [] },
          });
          await admin.from('podcast_deliverables').insert({ episode_id: ep.id, deliverable_type: 'transcript', status: 'draft' });
        }
        await advanceEpisode(ep.id, 'transcribed');
        await admin.from('tool_runs').insert({
          job_id: ep.job_id,
          tool_type: 'assemblyai_transcribe',
          provider: 'assemblyai',
          status: 'completed',
          output: { assemblyai_id: output.assemblyai_id ?? null, language: output.language ?? 'en' },
          completed_at: new Date().toISOString(),
        });
        await logEvent(ep.job_id, 'make', 'transcription_completed', 'Transcript received from AssemblyAI');
        return NextResponse.json({ ok: true, episode_id: ep.id });
      }

      case 'copy.generated': {
        const ep = await resolveEpisode(parsed.data.episode_id);
        if (!ep) return NextResponse.json({ error: 'episode_not_found' }, { status: 404 });

        const copy = {
          title: output.title ?? null,
          youtube_description: output.youtube_description ?? null,
          podcast_description: output.podcast_description ?? null,
          social_post: output.social_post ?? null,
          tags: output.tags ?? [],
        };

        const { data: existingTask } = await admin
          .from('ai_tasks')
          .select('id')
          .eq('job_id', ep.job_id)
          .eq('task_type', 'generate_podcast_copy')
          .maybeSingle();
        if (!existingTask) {
          await admin.from('ai_tasks').insert({
            job_id: ep.job_id,
            task_type: 'generate_podcast_copy',
            status: 'needs_review',
            requires_approval: true,
            output: copy,
          });
          await admin.from('podcast_deliverables').insert([
            { episode_id: ep.id, deliverable_type: 'show_notes', status: 'draft', notes: copy.podcast_description },
            { episode_id: ep.id, deliverable_type: 'social_caption', status: 'draft', notes: copy.social_post },
          ]);
        }

        // Stash copy on the episode for easy display (read-merge metadata);
        // the copy lands even when the status is already past needs_review.
        const meta = { ...(ep.metadata ?? {}), copy };
        await advanceEpisode(ep.id, 'needs_review', { metadata: meta });
        await logEvent(ep.job_id, 'agent', 'copy_generated', `AI copy ready: ${copy.title ?? '(untitled)'}`);
        return NextResponse.json({ ok: true, episode_id: ep.id });
      }

      case 'youtube.uploaded': {
        const ep = await resolveEpisode(parsed.data.episode_id);
        if (!ep) return NextResponse.json({ error: 'episode_not_found' }, { status: 404 });

        const youtube_url = output.youtube_url ?? (output.youtube_id ? `https://youtu.be/${output.youtube_id}` : null);

        const { data: existingDelivery } = await admin
          .from('delivery_versions')
          .select('id')
          .eq('job_id', ep.job_id)
          .eq('delivery_type', 'podcast_episode')
          .maybeSingle();
        if (!existingDelivery) {
          await admin.from('delivery_versions').insert({
            job_id: ep.job_id,
            delivery_type: 'podcast_episode',
            status: 'internal_review', // unlisted draft (#2)
            title: (ep.metadata?.copy?.title as string) ?? ep.metadata?.filename ?? null,
            external_url: youtube_url,
          });
          await admin.from('podcast_deliverables').insert({
            episode_id: ep.id,
            deliverable_type: 'full_episode_video',
            status: 'internal_review',
            external_url: youtube_url,
          });
          await admin.from('external_links').insert({
            job_id: ep.job_id,
            link_type: 'youtube_video',
            url: youtube_url,
            external_id: output.youtube_id ?? null,
            label: 'YouTube (unlisted)',
          });

          // Publish gate (#2): open a pending approval for going public/final.
          const policy = (await admin.from('approval_policies').select('id').eq('key', 'publish_content').maybeSingle()).data;
          await admin.from('approvals').insert({
            job_id: ep.job_id,
            policy_id: policy?.id ?? null,
            status: 'pending',
            notes: 'Review the unlisted upload + copy, then approve to publish publicly / finalize delivery.',
          });
        }

        await advanceEpisode(ep.id, 'ready_to_publish');
        await admin.from('jobs').update({ next_action: 'Human review + approve to publish' }).eq('id', ep.job_id);
        await logEvent(ep.job_id, 'make', 'youtube_uploaded', 'Uploaded to YouTube (unlisted) — awaiting approval', { youtube_url });
        return NextResponse.json({ ok: true, episode_id: ep.id });
      }

      case 'youtube.published': {
        // Phase 2 confirmation: the publish scenario flipped the video public.
        const ep = await resolveEpisode(parsed.data.episode_id);
        if (!ep) return NextResponse.json({ error: 'episode_not_found' }, { status: 404 });

        await advanceEpisode(ep.id, 'published');
        await admin.from('jobs').update({ next_action: null }).eq('id', ep.job_id);
        await admin
          .from('delivery_versions')
          .update({ status: 'published' })
          .eq('job_id', ep.job_id)
          .eq('delivery_type', 'podcast_episode');
        await admin
          .from('podcast_deliverables')
          .update({ status: 'published' })
          .eq('episode_id', ep.id)
          .eq('deliverable_type', 'full_episode_video');
        await admin
          .from('external_links')
          .update({ label: 'YouTube (public)' })
          .eq('job_id', ep.job_id)
          .eq('link_type', 'youtube_video');
        await admin
          .from('tool_runs')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('external_id', make_execution_id)
          .eq('tool_type', 'make_publish');
        await logEvent(ep.job_id, 'make', 'youtube_published', 'YouTube video flipped to public', {
          youtube_url: output.youtube_url ?? null,
        });
        return NextResponse.json({ ok: true, episode_id: ep.id });
      }

      case 'transistor.uploaded': {
        // Audio draft created on Transistor by the pipeline — record it and
        // keep it gated behind the same approval as YouTube.
        const ep = await resolveEpisode(parsed.data.episode_id);
        if (!ep) return NextResponse.json({ error: 'episode_not_found' }, { status: 404 });

        const transistorEpisodeId = String(output.transistor_episode_id ?? '');
        if (!transistorEpisodeId) return NextResponse.json({ error: 'transistor_episode_id_required' }, { status: 400 });

        const meta = { ...(ep.metadata ?? {}), transistor_episode_id: transistorEpisodeId };
        await admin.from('podcast_episodes').update({ metadata: meta }).eq('id', ep.id);

        const { data: existingAudio } = await admin
          .from('podcast_deliverables')
          .select('id')
          .eq('episode_id', ep.id)
          .eq('deliverable_type', 'full_episode_audio')
          .maybeSingle();
        if (!existingAudio) {
          await admin.from('podcast_deliverables').insert({
            episode_id: ep.id,
            deliverable_type: 'full_episode_audio',
            status: 'internal_review',
            external_url: output.transistor_url ?? null,
          });
        }
        await logEvent(ep.job_id, 'make', 'transistor_uploaded', 'Audio draft created on Transistor — awaiting approval', {
          transistor_episode_id: transistorEpisodeId,
        });
        return NextResponse.json({ ok: true, episode_id: ep.id });
      }

      case 'delivered': {
        const ep = await resolveEpisode(parsed.data.episode_id);
        if (ep) {
          await admin.from('tool_runs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('external_id', make_execution_id);
          await logEvent(ep.job_id, 'make', 'notification_sent', 'Make scenario finished + notified');
        }
        return NextResponse.json({ ok: true });
      }

      case 'scenario.failed': {
        const ep = await resolveEpisode(parsed.data.episode_id);
        await admin
          .from('tool_runs')
          .update({ status: 'failed', error: JSON.stringify(parsed.data.error ?? {}), completed_at: new Date().toISOString() })
          .eq('external_id', make_execution_id);
        await logEvent(ep?.job_id ?? null, 'make', 'make_scenario_failed', `Scenario failed: ${parsed.data.error?.step ?? 'unknown step'}`, {
          error: parsed.data.error ?? {},
        });
        return NextResponse.json({ ok: true });
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'callback_error' }, { status: 500 });
  }
}
