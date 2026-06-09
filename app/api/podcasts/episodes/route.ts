import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Manual episode planning (internal action). The Make pipeline creates episodes
 * automatically at intake; this lets producers register planned/scheduled
 * episodes ahead of time for any show. Record-keeping only — no automation is
 * triggered from here.
 */
const Body = z.object({
  show_id: z.string().uuid(),
  title: z.string().min(1).max(300),
  episode_number: z.number().int().positive().optional(),
  recorded_at: z.string().datetime().optional(),
  notes: z.string().max(5000).optional(),
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
  const admin = createAdminClient() as any;

  const { data: show } = await admin
    .from('podcast_shows')
    .select('id, name, default_language')
    .eq('id', parsed.data.show_id)
    .maybeSingle();
  if (!show) return NextResponse.json({ error: 'show_not_found' }, { status: 404 });

  const { data: episode, error } = await admin
    .from('podcast_episodes')
    .insert({
      show_id: show.id,
      title: parsed.data.title,
      episode_number: parsed.data.episode_number ?? null,
      status: 'scheduled',
      recorded_at: parsed.data.recorded_at ?? null,
      language: show.default_language ?? 'en',
      notes: parsed.data.notes ?? null,
      metadata: { source: 'manual' },
    })
    .select('id')
    .single();
  if (error || !episode) return NextResponse.json({ error: error?.message ?? 'create_failed' }, { status: 500 });

  await admin.from('production_events').insert({
    actor_type: 'user',
    actor_id: user.id,
    event_type: 'podcast_episode_planned',
    summary: `Planned episode "${parsed.data.title}" for ${show.name}`,
  });
  return NextResponse.json({ ok: true, episode_id: episode.id });
}
