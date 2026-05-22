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
const MAX_CONCURRENT = 1;
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

    // 3. Run dcraw_emu against a temp file. The current Debian libraw-bin
    // build of dcraw_emu rejects the classic `-c` (stdout) + numeric-arg
    // combination with "Non-numeric argument". Switching to file-based
    // output via -Z is more compatible and avoids stdout-buffer issues
    // on large 16-bit TIFFs anyway.
    //
    // Flags:
    //   -w   use camera white balance
    //   -T   write TIFF (16-bit) instead of PPM
    //   -q3  AHD interpolation, highest quality (no space — some
    //        dcraw_emu builds need flag+value concatenated)
    //   -o1  sRGB output color space
    //   -Z   explicit output file path (rather than stdout)
    const tmp = join(tmpdir(), `${randomUUID()}-${src.filename}`);
    const tiffOut = `${tmp}.tiff`;
    await fs.writeFile(tmp, rawBuf);
    log('decoding', { bytes: rawBuf.byteLength });

    await new Promise((resolve, reject) => {
      const proc = spawn('dcraw_emu', [
        '-w',
        '-T',
        '-q', '3',
        '-o', '1',
        '-Z', tiffOut,
        tmp,
      ]);
      const errChunks = [];
      proc.stderr.on('data', (c) => errChunks.push(c));
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`dcraw_emu exited ${code}: ${Buffer.concat(errChunks).toString().slice(0, 500)}`));
        } else {
          resolve();
        }
      });
    });

    // Read decoded TIFF from disk
    const tiff = await fs.readFile(tiffOut);

    // Best-effort cleanup of temp files
    fs.unlink(tmp).catch(() => {});
    fs.unlink(tiffOut).catch(() => {});

    // 4. TIFF → JPEG via Sharp (sRGB, 3000px long edge, q92)
    log('encoding_jpeg', { tiff_bytes: tiff.byteLength });
    const jpeg = await sharp(tiff)
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
      exif: { converted_from: src.filename, decoder: 'libraw/dcraw_emu' },
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
 * on the camera back. We extract that JPEG with `dcraw_emu -e` and stream it
 * back — no demosaicing, no encoding, much faster than the full /convert.
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

    // dcraw_emu -e writes the embedded JPEG next to the input as
    // <input>.thumb.jpg (or .ppm if there's no JPEG preview, but every
    // modern camera produces JPEG previews).
    await new Promise((resolve, reject) => {
      const proc = spawn('dcraw_emu', ['-e', tmp]);
      const errChunks = [];
      proc.stderr.on('data', (c) => errChunks.push(c));
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`dcraw_emu -e exited ${code}: ${Buffer.concat(errChunks).toString().slice(0, 500)}`));
        } else {
          resolve();
        }
      });
    });

    // Try common output paths produced by dcraw_emu -e.
    const candidates = [`${tmp}.thumb.jpg`, `${tmp}.jpg`, `${tmp}.thumb.tiff`, `${tmp}.thumb.ppm`];
    let thumbBytes = null;
    let pickedPath = null;
    for (const p of candidates) {
      try {
        thumbBytes = await fs.readFile(p);
        pickedPath = p;
        break;
      } catch {
        // try next candidate
      }
    }
    if (!thumbBytes) throw new Error('no_preview_extracted');

    // Resize to a sane preview size for the UI.
    const jpeg = await sharp(thumbBytes)
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    // Cleanup
    fs.unlink(tmp).catch(() => {});
    if (pickedPath) fs.unlink(pickedPath).catch(() => {});

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
