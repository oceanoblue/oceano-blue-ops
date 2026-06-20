import { NextResponse } from 'next/server';
import { z } from 'zod';
import exifr from 'exifr';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { mapWithConcurrency } from '@/lib/utils/concurrent';

/**
 * POST /api/photos/extract-exif  { order_id }
 *
 * Backfill bracket-relevant EXIF (ExposureBiasValue / DateTimeOriginal / camera)
 * onto an order's source frames by reading it server-side from the stored file.
 * Needed so bracket-vs-single detection works for RAW (the browser can't always
 * read ARW reliably) and for orders uploaded before client-side EXIF capture.
 *
 * Only the header is fetched (HTTP Range) — EXIF lives near the start of JPEG and
 * TIFF-based RAW, so we avoid pulling whole 30–60 MB files.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({ order_id: z.string().uuid() });

const RAW_EXT = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;
const HEADER_BYTES = 3 * 1024 * 1024; // 3 MB is plenty for the EXIF IFD

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { order_id } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const { data: photos } = await admin
    .from('photos')
    .select('id, bucket, storage_path, filename, exif, parent_photo_id')
    .eq('order_id', order_id)
    .eq('kind', 'raw');

  // Targets: source originals (RAW files, or standalone uploads with no parent)
  // that don't already have an exposure bias. Worker-converted JPEGs (parent set)
  // inherit their parent's EXIF on the client, so we skip them.
  const targets = ((photos ?? []) as any[]).filter((p) => {
    const e = (p.exif ?? {}) as any;
    if (typeof e.ExposureBiasValue === 'number') return false;
    return RAW_EXT.test(p.filename) || !p.parent_photo_id;
  });
  if (targets.length === 0) return NextResponse.json({ updated: 0 });

  // Sony ARW hides ExposureBiasValue from the browser/exifr reader, so RAW frames
  // are read by the worker (exiftool, which reads it reliably). Non-RAW originals
  // (camera JPEGs) are read inline with exifr. This route doubles as the one-time
  // reprocess for orders uploaded before exposure bias was captured: opening such
  // an order fires it and the grouping corrects once the bias lands.
  const workerUrl = process.env.ARW_WORKER_URL;
  const workerSecret = process.env.ARW_WORKER_SECRET;

  async function readRawViaWorker(p: any): Promise<Record<string, unknown> | null> {
    if (!workerUrl || !workerSecret) return null;
    const r = await fetch(`${workerUrl}/exif`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-secret': workerSecret },
      body: JSON.stringify({ photo_id: p.id }),
    }).catch(() => null);
    if (!r || !r.ok) return null;
    const t = await r.json().catch(() => null);
    if (!t) return null;
    const patch: Record<string, unknown> = {};
    if (typeof t.ExposureBiasValue === 'number') patch.ExposureBiasValue = t.ExposureBiasValue;
    if (typeof t.DateTimeOriginal === 'string') patch.DateTimeOriginal = t.DateTimeOriginal;
    return patch;
  }

  async function readViaExifr(p: any): Promise<Record<string, unknown> | null> {
    const { data: signed } = await admin.storage.from(p.bucket).createSignedUrl(p.storage_path, 120);
    const url = signed?.signedUrl;
    if (!url) return null;
    const res = await fetch(url, { headers: { Range: `bytes=0-${HEADER_BYTES - 1}` } });
    if (!res.ok && res.status !== 206 && res.status !== 200) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const t = await exifr
      .parse(buf, { pick: ['DateTimeOriginal', 'ExposureBiasValue', 'Make', 'Model', 'LensModel', 'FocalLength'] })
      .catch(() => null);
    if (!t) return null;
    const patch: Record<string, unknown> = {};
    if (t.DateTimeOriginal instanceof Date) patch.DateTimeOriginal = t.DateTimeOriginal.toISOString();
    else if (typeof t.DateTimeOriginal === 'string') patch.DateTimeOriginal = t.DateTimeOriginal;
    if (typeof t.ExposureBiasValue === 'number') patch.ExposureBiasValue = t.ExposureBiasValue;
    if (typeof t.Make === 'string') patch.Make = t.Make.trim();
    if (typeof t.Model === 'string') patch.Model = t.Model.trim();
    if (typeof t.LensModel === 'string') patch.LensModel = t.LensModel.trim();
    if (typeof t.FocalLength === 'number') patch.FocalLength = t.FocalLength;
    return patch;
  }

  let updated = 0;
  await mapWithConcurrency(targets, 4, async (p: any) => {
    try {
      const patch = RAW_EXT.test(p.filename) ? await readRawViaWorker(p) : await readViaExifr(p);
      if (!patch || Object.keys(patch).length === 0) return;
      const merged = { ...((p.exif ?? {}) as object), ...patch };
      const { error } = await admin.from('photos').update({ exif: merged }).eq('id', p.id);
      if (!error) updated += 1;
    } catch {
      /* best-effort per frame */
    }
  });

  return NextResponse.json({ updated, candidates: targets.length });
}
