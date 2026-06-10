import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Upload a show logo (internal action). The browser posts a base64 image; we
 * store it in the public-assets bucket under show-logos/<show_id> and save the
 * public URL on the show. Small brand images only — capped at ~3MB.
 */
const Body = z.object({
  show_id: z.string().uuid(),
  content_base64: z.string().min(1),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
});

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const MAX_BYTES = 3 * 1024 * 1024;

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
  const { show_id, content_base64, mime } = parsed.data;
  const admin = createAdminClient() as any;

  const { data: show } = await admin.from('podcast_shows').select('id').eq('id', show_id).maybeSingle();
  if (!show) return NextResponse.json({ error: 'show_not_found' }, { status: 404 });

  const bytes = Buffer.from(content_base64.replace(/^data:[^,]+,/, ''), 'base64');
  if (bytes.length === 0) return NextResponse.json({ error: 'empty_file' }, { status: 400 });
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: 'file_too_large' }, { status: 413 });

  const path = `show-logos/${show_id}.${EXT[mime]}`;
  const { error: upErr } = await admin.storage
    .from('public-assets')
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (upErr) return NextResponse.json({ error: 'upload_failed' }, { status: 500 });

  const { data: pub } = admin.storage.from('public-assets').getPublicUrl(path);
  // Cache-bust so a re-upload to the same path shows immediately.
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: updErr } = await admin.from('podcast_shows').update({ logo_url: url }).eq('id', show_id);
  if (updErr) return NextResponse.json({ error: 'save_failed' }, { status: 500 });

  return NextResponse.json({ ok: true, logo_url: url });
}
