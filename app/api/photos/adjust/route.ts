import { NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { enhanceSingle } from '@/lib/ai/oceano-enhance/pipeline';

/**
 * Re-render the Oceano Enhance pipeline against an existing photo with
 * caller-supplied knobs, and persist the result as a new processed photo.
 *
 * This is what the lightbox "Save as new version" button calls after the
 * photographer tweaks the slider panel. The new photo is inserted as a
 * sibling of the source — same parent_photo_id, same order_id, kind=processed
 * — so it shows up next to the original in the Processed grid.
 *
 * Different from /api/enhance/preview which returns the bytes inline and
 * doesn't persist anything.
 */
const Body = z.object({
  photo_id: z.string().uuid(),
  options: z.object({
    targetLongEdge: z.number().int().min(800).max(6000).optional(),
    jpegQuality: z.number().int().min(60).max(100).optional(),
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
    shadowLift: z.number().min(0).max(1).optional(),
    highlightRecover: z.number().min(0).max(1).optional(),
    vibrance: z.number().min(0).max(1).optional(),
  }),
});

// Timeout set in vercel.json (`functions`) — `export const maxDuration` makes
// the handler receive an empty cookie store here, breaking getUser() auth.

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
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: src, error: srcErr } = await admin
    .from('photos')
    .select('*')
    .eq('id', parsed.data.photo_id)
    .maybeSingle();
  if (srcErr || !src) {
    return NextResponse.json({ error: 'photo_not_found' }, { status: 404 });
  }

  // Always re-render from the raw parent if there is one — that way successive
  // adjustments don't compound on top of each other.
  let sourceBucket = src.bucket;
  let sourcePath = src.storage_path;
  let parentId: string = src.id;
  if (src.parent_photo_id) {
    const { data: parent } = await admin
      .from('photos')
      .select('bucket, storage_path, filename')
      .eq('id', src.parent_photo_id)
      .maybeSingle();
    if (parent) {
      sourceBucket = parent.bucket;
      sourcePath = parent.storage_path;
      parentId = src.parent_photo_id;
    }
  }

  const { data: file, error: dlErr } = await admin.storage
    .from(sourceBucket)
    .download(sourcePath);
  if (dlErr || !file) {
    return NextResponse.json({ error: dlErr?.message || 'download_failed' }, { status: 500 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const result = await enhanceSingle(buf, parsed.data.options);

  // Persist as a new processed photo sibling
  const newId = uuidv4();
  const baseName = (src.filename || 'photo').replace(/\.[^.]+$/, '');
  const newName = `${baseName}-adjusted-${Date.now()}.jpg`;
  const newPath = `${src.order_id}/${newId}-${newName}`;

  const { error: upErr } = await admin.storage
    .from('processed-photos')
    .upload(newPath, result.bytes, { contentType: 'image/jpeg', upsert: false });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const meta = await sharp(result.bytes).metadata();

  const { data: inserted, error: insErr } = await admin
    .from('photos')
    .insert({
      id: newId,
      order_id: src.order_id,
      kind: 'processed',
      parent_photo_id: parentId,
      storage_path: newPath,
      bucket: 'processed-photos',
      filename: newName,
      mime_type: 'image/jpeg',
      width: meta.width ?? null,
      height: meta.height ?? null,
      byte_size: result.bytes.byteLength,
      processing_status: 'complete',
      ai_provider: 'oceano-enhance',
      ai_prompt: `manual adjust (lift=${parsed.data.options.shadowLift ?? 'd'}, hl=${parsed.data.options.highlightRecover ?? 'd'}, vib=${parsed.data.options.vibrance ?? 'd'})`,
    })
    .select('id, filename')
    .single();
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    photo_id: inserted.id,
    filename: inserted.filename,
    width: meta.width,
    height: meta.height,
  });
}
