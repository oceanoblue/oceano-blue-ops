import archiver from 'archiver';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { deliveryFilename } from '@/lib/photos/order';

export const MLS_MAX_BYTES = 2_000_000;
export const ARCHIVE_BUFFER_BYTES = 64 * 1024;
export type ArchiveSize = 'full' | '4k' | 'print' | 'web';
export type ArchivePhoto = { id?: string; filename: string; bucket: string; storage_path: string; updated_at?: string | null; archiveIndex?: number; archiveTotal?: number };
export const ARCHIVE_PRESETS = {
  '4k': { longEdge: 4096, quality: 95, suffix: '-4k' },
  print: { longEdge: 3000, quality: 92, suffix: '-print' },
  web: { longEdge: 2048, quality: 85, suffix: '-web' },
} as const;
export type ArchiveResult = { count: number; bytes: number };

/** One source per completed ZIP entry, bounded byte queues, no recompression. */
export function createPhotoArchive(
  photos: ArchivePhoto[],
  size: ArchiveSize,
  openPhoto: (photo: ArchivePhoto) => Promise<Blob>,
  signal?: AbortSignal,
) {
  if (!photos.length) throw new Error('No delivered photos are available.');
  const archive = archiver('zip', { store: true, highWaterMark: ARCHIVE_BUFFER_BYTES });
  const preset = size === 'full' ? null : ARCHIVE_PRESETS[size];
  let current: Readable | null = null;
  let input: Readable | null = null;
  let transform: ReturnType<typeof sharp> | null = null;
  let count = 0;
  let ended = false;
  let resolveDone!: (value: ArchiveResult) => void;
  let rejectDone!: (error: Error) => void;
  const done = new Promise<ArchiveResult>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  void done.catch(() => undefined);
  const fail = (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error('Photo archive failed.');
    current?.destroy(error);
    input?.destroy(error);
    transform?.destroy(error);
    archive.destroy(error);
    rejectDone(error);
  };
  const abort = () => fail(new Error('Photo download was cancelled.'));
  archive.on('error', error => { rejectDone(error); current?.destroy(error); });
  archive.on('warning', fail);
  archive.on('entry', () => { count += 1; });
  archive.once('end', () => {
    ended = true;
    signal?.removeEventListener('abort', abort);
    if (count !== photos.length) rejectDone(new Error('Photo count mismatch.'));
    else resolveDone({ count, bytes: archive.pointer() });
  });
  archive.once('close', () => {
    signal?.removeEventListener('abort', abort);
    if (!ended) fail(new Error('Photo archive closed before completion.'));
  });
  signal?.addEventListener('abort', abort, { once: true });

  async function* photoBytes(photo: ArchivePhoto) {
    if (signal?.aborted || archive.destroyed) throw new Error('Photo download was cancelled.');
    const blob = await openPhoto(photo);
    if (!blob.size) throw new Error('A delivered photo is empty.');
    if (signal?.aborted || archive.destroyed) throw new Error('Photo download was cancelled.');
    input = Readable.fromWeb(blob.stream() as import('node:stream/web').ReadableStream<Uint8Array>, { highWaterMark: ARCHIVE_BUFFER_BYTES });
    try {
      if (size === 'web') {
        // Bound memory to one photo; never keep a gallery of decoded images.
        const source = Buffer.from(await blob.arrayBuffer());
        let output: Buffer | undefined;
        for (const longEdge of [2048, 1600, 1200]) {
          for (const quality of [85, 75, 65]) {
            output = await sharp(source, { sequentialRead: true, limitInputPixels: 100_000_000 })
              .rotate().resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality }).toBuffer();
            if (output.length < MLS_MAX_BYTES) break;
          }
          if (output!.length < MLS_MAX_BYTES) break;
        }
        if (!output || output.length >= MLS_MAX_BYTES) throw new Error('A photo could not be sized for MLS.');
        for (let offset = 0; offset < output.length; offset += ARCHIVE_BUFFER_BYTES) {
          yield output.subarray(offset, offset + ARCHIVE_BUFFER_BYTES);
        }
      } else if (preset) {
        transform = sharp({ sequentialRead: true, limitInputPixels: 100_000_000 })
          .rotate()
          .resize({ width: preset.longEdge, height: preset.longEdge, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: preset.quality });
        const pumping = pipeline(input, transform);
        void pumping.catch(fail);
        for await (const chunk of transform) {
          const bytes = Buffer.from(chunk);
          for (let offset = 0; offset < bytes.length; offset += ARCHIVE_BUFFER_BYTES) {
            yield bytes.subarray(offset, offset + ARCHIVE_BUFFER_BYTES);
          }
        }
        await pumping;
      } else {
        // Blob.stream() can yield an entire multi-MB photo in one chunk.
        for await (const chunk of input) {
          const bytes = Buffer.from(chunk);
          for (let offset = 0; offset < bytes.length; offset += ARCHIVE_BUFFER_BYTES) {
            yield bytes.subarray(offset, offset + ARCHIVE_BUFFER_BYTES);
          }
        }
      }
    } finally {
      input?.destroy();
      transform?.destroy();
      input = null;
      transform = null;
    }
  }

  async function produce() {
    try {
      if (signal?.aborted) throw new Error('Photo download was cancelled.');
      for (const [index, photo] of photos.entries()) {
        if (archive.destroyed) return;
        current = Readable.from(photoBytes(photo), { objectMode: false, highWaterMark: ARCHIVE_BUFFER_BYTES });
        current.on('error', fail);
        const written = once(archive, 'entry');
        const name = preset ? photo.filename.replace(/\.[^.]+$/, '') + preset.suffix + '.jpg' : photo.filename;
        archive.append(current, { name: deliveryFilename(name, photo.archiveIndex ?? index, photo.archiveTotal ?? photos.length) });
        await written;
        current = null;
      }
      await archive.finalize();
    } catch (error) { fail(error); }
  }
  queueMicrotask(() => { void produce(); });
  return { archive, done, cancel: abort };
}

export function archiveWebStream(archive: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(archive, {
    strategy: { highWaterMark: ARCHIVE_BUFFER_BYTES, size: (chunk: Uint8Array) => chunk.byteLength },
  }) as ReadableStream<Uint8Array>;
}
