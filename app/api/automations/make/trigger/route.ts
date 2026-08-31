import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Production OS → Make trigger (manual / re-run).
 *
 * The Dropbox watcher still lives in Make; this lets a producer kick the generic
 * podcast scenario (keyed by show_slug, decision #3) from POS. No secrets are
 * sent in the payload — Make holds its own credentials and the callback secret.
 * The Make webhook URL comes from env (MAKE_PODCAST_WEBHOOK_URL), never the repo.
 */
const Body = z.object({
  show_slug: z.string().min(1),
  dropbox_path: z.string().min(1),
  filename: z.string().optional(),
  season_episode: z.string().optional(),
  episode_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Staff only: lives under the public /api/automations prefix (Make callback
  // uses a shared secret), so the middleware waves it through — gate it here.
  const { data: isStaff } = await supabase.rpc('is_team_member');
  if (!isStaff) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const webhook = process.env.MAKE_PODCAST_WEBHOOK_URL;
  if (!webhook) return NextResponse.json({ error: 'make_webhook_not_configured' }, { status: 400 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const admin = createAdminClient() as any;

  const tr = (await admin
    .from('tool_runs')
    .insert({ tool_type: 'make_scenario', provider: 'make', status: 'queued', input: parsed.data, created_by: user.id })
    .select('id')
    .single()).data;

  const payload = {
    scenario: 'podcast_publish',
    pos_run_id: tr?.id ?? null,
    callback_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/automations/make/callback`,
    ...parsed.data,
    options: {
      transcription: { model: 'universal-2', speaker_labels: true, auto_chapters: true },
      youtube_privacy: 'unlisted',
      require_approval_before_publish: true,
    },
  };

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      await admin.from('tool_runs').update({ status: 'failed', error: `make webhook ${res.status}` }).eq('id', tr?.id);
      return NextResponse.json({ error: 'make_webhook_failed', status: res.status }, { status: 502 });
    }
  } catch (e: any) {
    await admin.from('tool_runs').update({ status: 'failed', error: e?.message ?? 'fetch_error' }).eq('id', tr?.id);
    return NextResponse.json({ error: 'make_webhook_error' }, { status: 502 });
  }

  await admin.from('production_events').insert({
    actor_type: 'user',
    actor_id: user.id,
    event_type: 'podcast_pipeline_triggered',
    summary: `Triggered podcast pipeline for ${parsed.data.show_slug}`,
    details: { show_slug: parsed.data.show_slug },
  });

  return NextResponse.json({ ok: true, pos_run_id: tr?.id });
}
