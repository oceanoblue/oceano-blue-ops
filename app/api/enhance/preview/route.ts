import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { enhanceSingle } from '@/lib/ai/oceano-enhance/pipeline';

/**
 * Render a one-off preview of the Oceano Enhance pipeline against an existing
 * photo, using a caller-supplied set of knobs. Used by the settings page so
 * you can tune sliders against a real photo before committing. The output is
 * returned as base64 — we don't persist anything.
 */
const Body = z.object({
  photo_id: z.string().uuid(),
  options: z.object({
    targetLongEdge: z.number().int().min(800).max(6000).optional(),
    jpegQuality: z.number().int().min(60).max(100).optional(),
    // Lightroom-style controls (all normalized -1..+1 or 0..1)
    exposure: z.number().min(-2).max(2).optional(),
    contrast: z.number().min(-1).max(1).optional(),
    temp: z.number().min(-1).max(1).optional(),
    tint: z.number().min(-1).max(1).optional(),
    saturation: z.number().min(-1).max(1).optional(),
    highlights: z.number().min(-1).max(1).optional(),
    shadows: z.number().min(-1).max(1).optional(),
    whites: z.number().min(-1).max(1).optional(),
    blacks: z.number().min(-1).max(1).optional(),
    sharpening: z.number().min(0).max(1).optional(),
    // Legacy
    shadowLift: z.number().min(0).max(1).optional(),
    highlightRecover: z.number().min(0).max(1).optional(),
    vibrance: z.number().min(0).max(1).optional(),
  }),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: photo } = await admin
    .from('photos')
    .select('bucket, storage_path, filename')
    .eq('id', parsed.data.photo_id)
    .maybeSingle();
  if (!photo) return NextResponse.json({ error: 'photo_not_found' }, { status: 404 });

  const { data: file, error: dlErr } = await admin.storage
    .from(photo.bucket)
    .download(photo.storage_path);
  if (dlErr || !file) {
    return NextResponse.json({ error: dlErr?.message || 'download_failed' }, { status: 500 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const result = await enhanceSingle(buf, parsed.data.options);
  // Smaller preview to keep response payloads sane.
  const preview = await (await import('sharp'))
    .default(result.bytes)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  return NextResponse.json({
    preview_b64: preview.toString('base64'),
    mime: 'image/jpeg',
    width: result.width,
    height: result.height,
  });
}
