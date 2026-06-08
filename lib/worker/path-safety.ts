import path from 'node:path';

/**
 * Safe local path handling for the local worker (used by the worker client in
 * PR B; kept here as a server-shared, unit-tested module).
 *
 * The worker must only ever READ within an explicit allowlist of root
 * directories. These helpers reject path traversal (`..`) and any target that
 * resolves outside the configured roots. Nothing here performs file operations.
 */

/** True if `target` resolves inside `root` (or equals it). */
export function isWithinRoot(root: string, target: string): boolean {
  const r = path.resolve(root);
  const t = path.isAbsolute(target) ? path.resolve(target) : path.resolve(r, target);
  if (t === r) return true;
  const rel = path.relative(r, t);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Resolve `target` against the first allowlisted root it falls within.
 * Returns the absolute path, or null if it escapes every root.
 */
export function safeResolveWithinRoots(roots: string[], target: string): string | null {
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

export type MediaType = 'photo' | 'video' | 'audio' | 'other';

export function mediaTypeFromExt(filename: string): MediaType {
  if (PHOTO.test(filename)) return 'photo';
  if (VIDEO.test(filename)) return 'video';
  if (AUDIO.test(filename)) return 'audio';
  return 'other';
}

/** Does a worker with `capabilities` accept this task type? */
export function workerHandlesTask(capabilities: string[], taskType: string): boolean {
  return Array.isArray(capabilities) && capabilities.includes(taskType);
}
