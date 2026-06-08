import { promises as fs } from 'node:fs';
import { config } from './config.mjs';
import { safeResolveWithinRoots, isRawFile } from './safety.mjs';

const MAX_EDGE = 512;
const QUALITY = 72;
const MAX_ITEMS = 20; // server accepts <= 20 thumbnails per result

// Build a small JPEG preview from a local file (read-only).
async function makeThumb(fullPath, filename) {
  const sharp = (await import('sharp')).default;
  let input = fullPath;
  if (isRawFile(filename)) {
    // RAW can't be decoded by sharp; use the camera-embedded JPEG preview.
    const exifr = (await import('exifr')).default;
    const thumb = await exifr.thumbnail(fullPath).catch(() => null);
    if (!thumb) return null;
    input = Buffer.from(thumb);
  }
  const buf = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALITY })
    .toBuffer();
  return buf.toString('base64');
}

export async function handleThumbnails(task) {
  const items = Array.isArray(task.payload?.items) ? task.payload.items : [];
  if (items.length === 0) {
    return { task_id: task.id, status: 'completed', result: { thumbnails: 0 }, thumbnails: [] };
  }

  const thumbnails = [];
  let failed = 0;
  for (const item of items.slice(0, MAX_ITEMS)) {
    const full = safeResolveWithinRoots(config.roots, item.local_path ?? '');
    if (!full || !item.asset_id) {
      failed++;
      continue;
    }
    const exists = await fs.stat(full).then(() => true).catch(() => false);
    if (!exists) {
      failed++;
      continue;
    }
    try {
      const b64 = await makeThumb(full, full.split('/').pop() ?? '');
      if (b64) thumbnails.push({ asset_id: item.asset_id, content_base64: b64, mime: 'image/jpeg' });
      else failed++;
    } catch {
      failed++;
    }
  }

  return {
    task_id: task.id,
    status: 'completed',
    result: { thumbnails: thumbnails.length, failed, truncated: items.length > MAX_ITEMS },
    thumbnails,
  };
}
