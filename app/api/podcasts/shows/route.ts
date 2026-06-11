import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createShowFolder } from '@/lib/integrations/dropbox';

export const dynamic = 'force-dynamic';

/**
 * Podcast show management (internal action). Shows are the per-client registry
 * the Make pipeline keys on: intake matches `show_slug` against
 * podcast_shows.slug, so a show created here automatically receives its
 * episodes — no manual table edits.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX = /^#?[0-9a-fA-F]{6}$/;

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(SLUG, 'lowercase letters, numbers and hyphens only'),
  client_id: z.string().uuid().nullable().optional(),
  hosts: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  default_language: z.string().min(2).max(10).default('en'),
  // Branding (Phase A) — fed into the AI copy + dashboard.
  tagline: z.string().max(300).optional(),
  mood: z.string().max(300).optional(),
  tone: z.string().max(300).optional(),
  brand_color: z.string().regex(HEX, 'use a 6-digit hex color').optional().or(z.literal('')),
  visual_style: z.string().max(2000).optional(),
  audio_style: z.string().max(2000).optional(),
  intro_rules: z.string().max(2000).optional(),
  outro_rules: z.string().max(2000).optional(),
  // Distribution: which channels this show publishes to + Transistor mapping.
  publishing_platforms: z.array(z.enum(['youtube', 'audio'])).optional(),
  transistor_show_id: z.string().max(100).optional().or(z.literal('')),
});

const UpdateBody = CreateBody.partial().extend({ show_id: z.string().uuid() });

/** Drop undefined keys + normalize empties so PATCH only writes provided fields. */
function brandingColumns(src: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of [
    'name', 'slug', 'client_id', 'hosts', 'description', 'default_language',
    'tagline', 'mood', 'tone', 'visual_style', 'audio_style', 'intro_rules', 'outro_rules',
  ]) {
    if (src[k] !== undefined) out[k] = src[k] === '' ? null : src[k];
  }
  if (src.publishing_platforms !== undefined) out.publishing_platforms = src.publishing_platforms;
  if (src.transistor_show_id !== undefined) out.transistor_show_id = src.transistor_show_id || null;
  if (src.brand_color !== undefined) {
    out.brand_color = src.brand_color ? `#${String(src.brand_color).replace('#', '')}` : null;
  }
  return out;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = CreateBody.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const admin = createAdminClient() as any;

  const { data: existing } = await admin.from('podcast_shows').select('id').eq('slug', parsed.data.slug).maybeSingle();
  if (existing) return NextResponse.json({ error: 'slug_taken' }, { status: 409 });

  const { data: show, error } = await admin
    .from('podcast_shows')
    .insert({
      ...brandingColumns(parsed.data),
      slug: parsed.data.slug,
      client_id: parsed.data.client_id ?? null,
      default_language: parsed.data.default_language,
    })
    .select('id')
    .single();
  if (error || !show) return NextResponse.json({ error: error?.message ?? 'create_failed' }, { status: 500 });

  // Phase B: best-effort auto-create the show's Dropbox folder. Never blocks
  // show creation — reports status so the UI can tell the producer.
  const dropbox = await createShowFolder(parsed.data.slug);

  await admin.from('production_events').insert({
    actor_type: 'user',
    actor_id: user.id,
    event_type: 'podcast_show_created',
    summary: `Created show "${parsed.data.name}" (${parsed.data.slug})`,
    details: { dropbox },
  });
  return NextResponse.json({ ok: true, show_id: show.id, dropbox });
}

export async function PATCH(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = UpdateBody.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { show_id, ...patch } = parsed.data;
  const admin = createAdminClient() as any;

  if (patch.slug) {
    const { data: clash } = await admin
      .from('podcast_shows')
      .select('id')
      .eq('slug', patch.slug)
      .neq('id', show_id)
      .maybeSingle();
    if (clash) return NextResponse.json({ error: 'slug_taken' }, { status: 409 });
  }

  const columns = brandingColumns(patch);

  const { data: updated, error } = await admin
    .from('podcast_shows')
    .update(columns)
    .eq('id', show_id)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated || updated.length === 0) return NextResponse.json({ error: 'show_not_found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
