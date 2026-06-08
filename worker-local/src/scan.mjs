import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { safeResolveWithinRoots, isMediaFile, isRawFile, mimeFromExt } from './safety.mjs';

const MAX_FILES = 5000; // safety cap per scan

// Recursively list media files under `dir` (read-only). Skips symlinks (so a
// link can't redirect us outside the allowlist) and hidden/system folders.
async function walk(dir, out) {
  if (out.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (out.length >= MAX_FILES) return;
    if (ent.isSymbolicLink()) continue; // never follow symlinks
    if (ent.name.startsWith('.') || ent.name === '@eaDir') continue; // hidden / Synology thumbs
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(full, out);
    } else if (ent.isFile() && isMediaFile(ent.name)) {
      out.push(full);
    }
  }
}

async function readExif(fullPath, filename) {
  // Best-effort; only for images. Returns { exif, captured_at }.
  try {
    const exifr = (await import('exifr')).default;
    const tags = await exifr.parse(fullPath, {
      pick: ['DateTimeOriginal', 'ExposureBiasValue', 'Make', 'Model', 'LensModel', 'FocalLength', 'ISO'],
    });
    if (!tags) return { exif: {}, captured_at: null };
    const captured_at = tags.DateTimeOriginal instanceof Date ? tags.DateTimeOriginal.toISOString() : null;
    return { exif: tags, captured_at };
  } catch {
    return { exif: {}, captured_at: null };
  }
}

export async function handleScan(task) {
  const requested = task.payload?.root_path;
  if (!requested) return { task_id: task.id, status: 'failed', error: 'root_path missing from payload' };

  // Enforce the allowlist before touching disk.
  const root = safeResolveWithinRoots(config.roots, requested);
  if (!root) {
    return { task_id: task.id, status: 'failed', error: `root_path '${requested}' is outside the worker allowlist` };
  }
  const stat = await fs.stat(root).catch(() => null);
  if (!stat?.isDirectory()) {
    return { task_id: task.id, status: 'failed', error: `root_path '${root}' is not a directory` };
  }

  const found = [];
  await walk(root, found);

  const files = [];
  for (const full of found) {
    const filename = path.basename(full);
    const st = await fs.stat(full).catch(() => null);
    if (!st) continue;
    // RAW EXIF parsing is heavier; skip it during the v1 scan pass.
    const { exif, captured_at } = isRawFile(filename)
      ? { exif: {}, captured_at: null }
      : await readExif(full, filename);
    files.push({
      filename,
      local_path: full,
      byte_size: st.size,
      mime_type: mimeFromExt(filename),
      captured_at,
      exif,
    });
  }

  return {
    task_id: task.id,
    status: 'completed',
    result: { root, file_count: files.length, truncated: found.length >= MAX_FILES },
    storage_location: { name: config.name, kind: config.storageKind, root_path: root },
    files,
  };
}
