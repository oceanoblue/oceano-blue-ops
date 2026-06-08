import path from 'node:path';

// Safe local path handling. The worker only ever READS within an explicit
// allowlist of root directories. Mirrors lib/worker/path-safety.ts (which is
// unit-tested in the main app). Nothing here mutates the filesystem.

export function isWithinRoot(root, target) {
  const r = path.resolve(root);
  const t = path.isAbsolute(target) ? path.resolve(target) : path.resolve(r, target);
  if (t === r) return true;
  const rel = path.relative(r, t);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// Resolve `target` against the first allowlisted root it falls within.
// Returns the absolute path, or null if it escapes every root.
export function safeResolveWithinRoots(roots, target) {
  for (const root of roots) {
    if (isWithinRoot(root, target)) {
      const r = path.resolve(root);
      return path.isAbsolute(target) ? path.resolve(target) : path.resolve(r, target);
    }
  }
  return null;
}

const PHOTO = /\.(jpe?g|png|tiff?|heic|webp|arw|cr2|cr3|nef|dng|raf|rw2|orf|gif|bmp)$/i;
const VIDEO = /\.(mp4|mov|m4v|avi|mkv|mxf|webm|wmv|flv|mts|m2ts)$/i;
const AUDIO = /\.(wav|mp3|aac|flac|m4a|aiff?|ogg)$/i;
const RAW = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;

export function mediaTypeFromExt(filename) {
  if (PHOTO.test(filename)) return 'photo';
  if (VIDEO.test(filename)) return 'video';
  if (AUDIO.test(filename)) return 'audio';
  return 'other';
}

export function isMediaFile(filename) {
  return PHOTO.test(filename) || VIDEO.test(filename) || AUDIO.test(filename);
}

export function isRawFile(filename) {
  return RAW.test(filename);
}

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.tif': 'image/tiff', '.tiff': 'image/tiff', '.webp': 'image/webp', '.heic': 'image/heic',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v', '.mkv': 'video/x-matroska',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
};

export function mimeFromExt(filename) {
  return MIME[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
}
