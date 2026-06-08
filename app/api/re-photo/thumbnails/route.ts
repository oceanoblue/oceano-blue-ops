import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Real Estate Photo Rescue v2 — thumbnail storage.
 *
 * The browser generates small JPEG previews locally (canvas for JPEG/PNG,
 * embedded EXIF preview for RAW) and posts them here base64-encoded. We upload
 * each to the private `thumbnails` bucket and record the storage path in
 * `assets.thumbnail_url`. Full-resolution originals never leave the local
 * machine — only these lightweight previews are stored.
 *
 * Thumbnails are posted in small batches by the client to stay well under the
 * serverless body limit.
 */
const Body = z.object({
  job_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        asset_id: z.string().uuid(),
        content_base64: z.string().min(1),
        mime: z.string().optional().default('image/jpeg'),
      })
    )
    .min(1)
    .max(20),
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
  const { job_id, items } = parsed.data;
  const admin = createAdminClient() as any;

  let stored = 0;
  for (const item of items) {
    const ext = item.mime.includes('png') ? 'png' : item.mime.includes('webp') ? 'webp' : 'jpg';
    const path = `${job_id}/${item.asset_id}.${ext}`;
    const buffer = Buffer.from(item.content_base64, 'base64');
    const { error: upErr } = await admin.storage
      .from('thumbnails')
      .upload(path, buffer, { contentType: item.mime, upsert: true });
    if (upErr) continue;
    await admin.from('assets').update({ thumbnail_url: path }).eq('id', item.asset_id);
    stored++;
  }

  if (stored > 0) {
    await admin.from('tool_runs').insert({
      job_id,
      tool_type: 'local_worker',
      provider: 'thumbnail_generate',
      status: 'completed',
      output: { thumbnails: stored },
      completed_at: new Date().toISOString(),
      created_by: user.id,
    });
    await admin.from('production_events').insert({
      job_id,
      actor_type: 'user',
      actor_id: user.id,
      event_type: 'thumbnails_generated',
      summary: `Generated ${stored} thumbnail(s)`,
      details: { count: stored },
    });
  }

  return NextResponse.json({ ok: true, stored });
}
