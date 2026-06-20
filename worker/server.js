// Oceano ARW Conversion Worker
//
// POST /convert { photo_id }
//   1. Look up the photo row in Supabase
//   2. Download the ARW bytes from raw-photos bucket
//   3. Pipe through dcraw_emu → 16-bit linear TIFF → Sharp → JPEG (sRGB, 3000px)
//   4. Upload the JPEG back to raw-photos under a sibling path
//   5. Insert a new photos row with parent_photo_id = source ARW id
//   6. Respond with the new photo id so the caller can refresh the UI

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';
import WebSocket from 'ws';

// supabase-js eagerly imports its realtime module which needs a global
// WebSocket. Node 22 has one natively but on older Node this would crash at
// `createClient`. Polyfill defensively so the worker boots cleanly regardless
// of the base image.
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}

const PORT = parseInt(process.env.PORT || '8080', 10);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WORKER_SECRET = process.env.WORKER_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !WORKER_SECRET) {
  console.error(
    '[arw-worker] Missing required env: SUPABASE_URL, SUPABASE_SERVICE_KEY, WORKER_SECRET'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/', (_req, res) => res.json({ ok: true, service: 'oceano-arw-worker' }));
app.get('/health', (_req, res) => res.json({ ok: true, active: activeConverts, waiting: convertQueue.length }));

// In-process concurrency limit. Each ARW decode peaks at ~400-600 MB of RAM,
// so we let only one convert run at a time on this size machine. Additional
// requests wait their turn instead of dog-piling the kernel into OOM kills.
// Env-tunable: each ARW decode peaks at ~400-600 MB RAM, so keep this at 1 on
// the 256 MB free tier. After scaling the Fly machine (e.g.
// `fly scale vm shared-cpu-2x --memory 2048`), set WORKER_CONCURRENCY=3 to
// triple throughput.
const MAX_CONCURRENT = Math.max(1, parseInt(process.env.WORKER_CONCURRENCY || '1', 10) || 1);
let activeConverts = 0;
const convertQueue = [];

function acquireConvertSlot() {
  return new Promise((resolve) => {
    if (activeConverts < MAX_CONCURRENT) {
      activeConverts++;
      resolve();
    } else {
      convertQueue.push(resolve);
    }
  });
}

function releaseConvertSlot() {
  activeConverts--;
  const next = convertQueue.shift();
  if (next) {
    activeConverts++;
    next();
  }
}

// Convert strategy. 'preview' (default) extracts the camera's embedded full-size
// JPEG — near-instant, no demosaic — and only falls back to a dcraw decode when
// the preview is missing or too small. 'demosaic' forces the full dcraw path.
const CONVERT_MODE = (process.env.RAW_CONVERT_MODE || 'preview').toLowerCase();
// Only trust an embedded preview if it's at least this big on the long edge
// (Sony ARW embeds a full-res ~6000px JPEG; some bodies embed only a small one).
const MIN_PREVIEW_EDGE = parseInt(process.env.MIN_PREVIEW_EDGE || '2400', 10);
// dcraw interpolation quality for the fallback path. 1 (VNG) is several times
// faster than 3 (AHD) and visually identical once downscaled to 3000px + JPEG.
const DCRAW_QUALITY = process.env.DCRAW_QUALITY || '1';

/** Extract the embedded JPEG preview bytes from a RAW temp file (or null). */
function extractEmbeddedPreview(tmpPath) {
  const extractTag = (tag) =>
    new Promise((resolve) => {
      const proc = spawn('exiftool', ['-b', `-${tag}`, tmpPath]);
      const chunks = [];
      proc.stdout.on('data', (c) => chunks.push(c));
      proc.on('error', () => resolve(null));
      proc.on('close', () => {
        const buf = Buffer.concat(chunks);
        resolve(buf.length > 0 ? buf : null);
      });
    });
  return (async () => {
    return (
      (await extractTag('PreviewImage')) ||
      (await extractTag('JpgFromRaw')) ||
      (await extractTag('ThumbnailImage'))
    );
  })();
}

/**
 * Read the bracket-defining EXIF off a RAW temp file via exiftool (numeric).
 *
 * The browser's EXIF reader (exifr) silently drops ExposureBiasValue on Sony
 * ARW — it returns DateTimeOriginal/lens/camera but not the exposure
 * compensation, which is THE signal that tells a bracketed frame from a single.
 * exiftool reads it reliably (standard EXIF + Sony MakerNote), so we capture it
 * here while the file is already on disk for conversion. Returns the parsed
 * exiftool object or null.
 */
function extractBracketExif(tmpPath) {
  return new Promise((resolve) => {
    const proc = spawn('exiftool', ['-j', '-n', '-ExposureBiasValue', '-DateTimeOriginal', tmpPath]);
    const chunks = [];
    proc.stdout.on('data', (c) => chunks.push(c));
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      try {
        const arr = JSON.parse(Buffer.concat(chunks).toString() || '[]');
        resolve(Array.isArray(arr) && arr[0] ? arr[0] : null);
      } catch {
        resolve(null);
      }
    });
  });
}

/** Demosaic a RAW temp file to a 16-bit TIFF buffer via dcraw_emu. */
function demosaicToTiff(tmpPath, filename) {
  const tiffOut = `${tmpPath}.tiff`;
  return new Promise((resolve, reject) => {
    const proc = spawn('dcraw_emu', ['-w', '-T', '-q', DCRAW_QUALITY, '-o', '1', '-Z', tiffOut, tmpPath]);
    const errChunks = [];
    proc.stderr.on('data', (c) => errChunks.push(c));
    proc.on('error', reject);
    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`dcraw_emu exited ${code}: ${Buffer.concat(errChunks).toString().slice(0, 500)}`));
        return;
      }
      try {
        const tiff = await fs.readFile(tiffOut);
        fs.unlink(tiffOut).catch(() => {});
        resolve(tiff);
      } catch (e) {
        reject(e);
      }
    });
  });
}

app.post('/convert', async (req, res) => {
  // Auth: main app must include the shared secret. This keeps the worker from
  // being abused by random internet traffic.
  if (req.headers['x-worker-secret'] !== WORKER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const photoId = req.body?.photo_id;
  if (typeof photoId !== 'string') {
    return res.status(400).json({ error: 'photo_id required' });
  }

  // Wait for a memory slot before starting the decode. With MAX_CONCURRENT=1
  // this serializes back-to-back requests so we never blow up the machine.
  await acquireConvertSlot();

  const log = (msg, extra = {}) =>
    console.log(JSON.stringify({ msg, photo_id: photoId, ...extra }));

  try {
    // 1. Fetch the source photo row
    const { data: src, error: srcErr } = await supabase
      .from('photos')
      .select('*')
      .eq('id', photoId)
      .single();
    if (srcErr || !src) throw new Error(`source_not_found: ${srcErr?.message ?? 'no row'}`);

    if (!/\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i.test(src.filename)) {
      return res.status(400).json({ error: 'not_a_raw_file', filename: src.filename });
    }

    log('downloading');
    // 2. Download bytes
    const { data: file, error: dlErr } = await supabase.storage
      .from(src.bucket)
      .download(src.storage_path);
    if (dlErr || !file) throw new Error(`download_failed: ${dlErr?.message}`);

    const rawBuf = Buffer.from(await file.arrayBuffer());

    const tmp = join(tmpdir(), `${randomUUID()}-${src.filename}`);
    await fs.writeFile(tmp, rawBuf);

    // 3. Get a source image. Preview-first: extract the camera's embedded
    // full-size JPEG (near-instant, no demosaic) and only fall back to a dcraw
    // decode when there's no usable preview. The embedded JPEG is the camera's
    // own render at the captured exposure — ideal for HDR merge + AI enhance,
    // and far faster than AHD demosaicing every frame.
    let sourceBuf = null;
    let method = 'embedded-preview';
    if (CONVERT_MODE !== 'demosaic') {
      const preview = await extractEmbeddedPreview(tmp);
      if (preview) {
        const pm = await sharp(preview).metadata().catch(() => null);
        if (pm && Math.max(pm.width || 0, pm.height || 0) >= MIN_PREVIEW_EDGE) {
          sourceBuf = preview;
          log('using_embedded_preview', { preview_edge: Math.max(pm.width || 0, pm.height || 0) });
        }
      }
    }
    if (!sourceBuf) {
      method = 'libraw/dcraw_emu';
      log('decoding', { bytes: rawBuf.byteLength, q: DCRAW_QUALITY });
      sourceBuf = await demosaicToTiff(tmp, src.filename);
    }

    // Backfill the bracket-defining EXIF the browser drops on Sony ARW, onto the
    // SOURCE raw row. The grouping engine reads exposure bias off the source (and
    // converted JPEGs inherit it via parent_photo_id), so this is what lets it
    // tell 3-shot brackets from interspersed detail singles instead of guessing
    // by filename. Best-effort: never let it fail the conversion.
    try {
      const bx = await extractBracketExif(tmp);
      if (bx && typeof bx.ExposureBiasValue === 'number' && (src.exif?.ExposureBiasValue == null)) {
        await supabase
          .from('photos')
          .update({ exif: { ...(src.exif || {}), ExposureBiasValue: bx.ExposureBiasValue } })
          .eq('id', src.id);
        log('source_exif_backfilled', { ev: bx.ExposureBiasValue });
      }
    } catch (e) {
      log('exif_backfill_failed', { error: e?.message || String(e) });
    }

    fs.unlink(tmp).catch(() => {});

    // 4. → JPEG via Sharp (sRGB, 3000px long edge, q92)
    log('encoding_jpeg', { src_bytes: sourceBuf.byteLength, method });
    const jpeg = await sharp(sourceBuf)
      .rotate()
      .resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92, mozjpeg: true, progressive: true })
      .toBuffer();
    const meta = await sharp(jpeg).metadata();

    // 5. Upload the JPEG back to raw-photos as a sibling
    const newId = randomUUID();
    const newName = src.filename.replace(/\.[^.]+$/, '') + '.jpg';
    const newPath = `${src.order_id}/${newId}-${newName}`;
    log('uploading_jpeg', { bytes: jpeg.byteLength, path: newPath });

    const { error: upErr } = await supabase.storage
      .from('raw-photos')
      .upload(newPath, jpeg, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw new Error(`upload_failed: ${upErr.message}`);

    // 6. Insert a sibling photos row. We mark the converted JPEG as 'raw' so
    // it shows up in the raw uploads grid and is eligible for AI processing.
    const { error: insErr } = await supabase.from('photos').insert({
      id: newId,
      order_id: src.order_id,
      kind: 'raw',
      parent_photo_id: src.id,
      storage_path: newPath,
      bucket: 'raw-photos',
      filename: newName,
      mime_type: 'image/jpeg',
      width: meta.width,
      height: meta.height,
      byte_size: jpeg.byteLength,
      processing_status: 'pending',
      uploaded_by: src.uploaded_by,
      exif: { converted_from: src.filename, decoder: method },
    });
    if (insErr) throw new Error(`insert_failed: ${insErr.message}`);

    log('done', { new_photo_id: newId });
    res.json({ photo_id: newId, width: meta.width, height: meta.height });
  } catch (err) {
    console.error('[arw-worker] error', err);
    res.status(500).json({ error: err?.message || String(err) });
  } finally {
    // Always release the concurrency slot so the next queued request can run,
    // even if this one threw before reaching the success path.
    releaseConvertSlot();
  }
});

/**
 * Fast embedded-JPEG preview extraction. Every camera writes a small JPEG
 * preview (typically 1600-2400px) inside the ARW/CR3/etc for instant review
 * on the camera back. We extract that JPEG with exiftool and stream it back —
 * no demosaicing, no encoding, much faster than the full /convert.
 *
 * Used by the bracket-card UI so the photographer can see what they're about
 * to approve without waiting for the full conversion pipeline.
 *
 * POST /preview { photo_id }  →  image/jpeg bytes
 */
app.post('/preview', async (req, res) => {
  if (req.headers['x-worker-secret'] !== WORKER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const photoId = req.body?.photo_id;
  if (typeof photoId !== 'string') {
    return res.status(400).json({ error: 'photo_id required' });
  }

  await acquireConvertSlot();
  const log = (msg, extra = {}) =>
    console.log(JSON.stringify({ msg, photo_id: photoId, ...extra }));

  try {
    const { data: src, error: srcErr } = await supabase
      .from('photos')
      .select('*')
      .eq('id', photoId)
      .single();
    if (srcErr || !src) throw new Error(`source_not_found: ${srcErr?.message ?? 'no row'}`);
    if (!/\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i.test(src.filename)) {
      return res.status(400).json({ error: 'not_a_raw_file', filename: src.filename });
    }

    const { data: file, error: dlErr } = await supabase.storage
      .from(src.bucket)
      .download(src.storage_path);
    if (dlErr || !file) throw new Error(`download_failed: ${dlErr?.message}`);
    const rawBuf = Buffer.from(await file.arrayBuffer());

    const tmp = join(tmpdir(), `${randomUUID()}-${src.filename}`);
    await fs.writeFile(tmp, rawBuf);
    log('extracting_preview', { bytes: rawBuf.byteLength });

    // Extract the camera's embedded JPEG preview (Sony ARW → PreviewImage, other
    // bodies → JpgFromRaw / ThumbnailImage) via the shared helper.
    const thumbBytes = await extractEmbeddedPreview(tmp);
    if (!thumbBytes) throw new Error('no_preview_extracted');

    // Resize to a sane preview size for the UI.
    const jpeg = await sharp(thumbBytes)
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    // Cleanup (exiftool streams to stdout, so only the input temp file exists).
    fs.unlink(tmp).catch(() => {});

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(jpeg);
  } catch (err) {
    console.error('[arw-worker] preview error', err);
    res.status(500).json({ error: err?.message || String(err) });
  } finally {
    releaseConvertSlot();
  }
});

app.listen(PORT, () => {
  console.log(`[arw-worker] listening on :${PORT}`);
});
