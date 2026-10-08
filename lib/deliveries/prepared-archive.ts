import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import type { createAdminClient } from '@/lib/supabase/server';
import { createPhotoArchive, type ArchivePhoto, type ArchiveSize } from './photo-archive';

const BUCKET = 'gallery-downloads';
const CACHE_MS = 24 * 60 * 60 * 1000;
type Client = ReturnType<typeof createAdminClient>;
type Block = { path: string; bytes: number };
type Manifest = { version: 2; blocks: Block[]; count: number; bytes: number; sha256: string; createdAt: number };
export const STORAGE_BLOCK_BYTES = 16 * 1024 * 1024;
const running = new Map<string, Promise<Manifest>>();
export class ArchiveBusyError extends Error {}

/** Constant-space checksum + ZIP footer validation. Never buffer the ZIP. */
export class ZipAudit extends Transform {
  private hash = createHash('sha256');
  private tail = Buffer.alloc(0);
  bytes = 0;
  constructor() { super({ highWaterMark: 64 * 1024 }); }
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) {
    this.bytes += chunk.length;
    this.hash.update(chunk);
    this.tail = Buffer.concat([this.tail, chunk.subarray(Math.max(0, chunk.length - 98))]).subarray(-98);
    callback(null, chunk);
  }
  result(expectedCount: number) {
    const end = this.tail.subarray(-22);
    if (end.length !== 22 || end.readUInt32LE(0) !== 0x06054b50 || end.readUInt16LE(20) !== 0) {
      throw new Error('The archive did not finish correctly.');
    }
    const zip64 = end.readUInt16LE(10) === 0xffff || end.readUInt32LE(12) === 0xffffffff || end.readUInt32LE(16) === 0xffffffff;
    if (zip64) {
      const tail = this.tail;
      if (tail.length !== 98 || tail.readUInt32LE(0) !== 0x06064b50 || tail.readBigUInt64LE(4) !== 44n ||
          tail.readUInt32LE(56) !== 0x07064b50 || tail.readBigUInt64LE(32) !== BigInt(expectedCount) ||
          tail.readBigUInt64LE(40) + tail.readBigUInt64LE(48) !== BigInt(this.bytes - 98)) {
        throw new Error('The ZIP64 archive did not finish correctly.');
      }
    } else if (end.readUInt16LE(10) !== expectedCount || end.readUInt32LE(12) + end.readUInt32LE(16) !== this.bytes - 22) {
      throw new Error('The archive did not finish correctly.');
    }
    return { bytes: this.bytes, sha256: this.hash.digest('hex') };
  }
}

async function readManifest(client: Client, path: string, count: number): Promise<Manifest | null> {
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (!data) {
    if (!error || ['404', '400'].includes(String((error as any).statusCode)) && /not.?found|does not exist/i.test(error.message)) return null;
    throw new Error('Download storage is unavailable.');
  }
  try {
    const manifest = JSON.parse(await data.text()) as Manifest;
    const prefix = path.replace(/\.json$/, '-');
    if (manifest.version === 2 && manifest.count === count && Number.isSafeInteger(manifest.bytes) && manifest.bytes > 22 &&
        Array.isArray(manifest.blocks) && manifest.blocks.length > 0 &&
        manifest.blocks.every(block => typeof block.path === 'string' && block.path.startsWith(prefix) &&
          !block.path.includes('..') && Number.isSafeInteger(block.bytes) && block.bytes > 0 && block.bytes <= STORAGE_BLOCK_BYTES) &&
        manifest.blocks.reduce((sum, block) => sum + block.bytes, 0) === manifest.bytes &&
        /^[a-f0-9]{64}$/.test(manifest.sha256) && manifest.createdAt <= Date.now() && Date.now() - manifest.createdAt < CACHE_MS) return manifest;
  } catch { /* An invalid/old cache never authorizes a download. Rebuild it. */ }
  return null;
}

/** Storage blocks are consecutive bytes of ONE ZIP, never separate photo archives. */
async function* storedBytes(client: Client, blocks: Block[], start = 0, end = Infinity, signal?: AbortSignal) {
  let offset = 0;
  for (const block of blocks) {
    const blockStart = offset;
    offset += block.bytes;
    if (offset <= start) continue;
    if (blockStart > end) break;
    signal?.throwIfAborted();
    const { data, error } = await client.storage.from(BUCKET).download(block.path).asStream();
    if (error || !data) throw new Error('The stored archive could not be retrieved.');
    const reader = data.getReader();
    const abort = () => { void reader.cancel(); };
    signal?.addEventListener('abort', abort, { once: true });
    let read = 0;
    try {
      while (true) {
        signal?.throwIfAborted();
        const next = await reader.read();
        signal?.throwIfAborted();
        if (next.done) break;
        const chunkStart = blockStart + read;
        read += next.value.length;
        if (read > block.bytes) throw new Error('Stored archive block size mismatch.');
        const from = Math.max(0, start - chunkStart);
        const to = Math.min(next.value.length, end - chunkStart + 1);
        if (to > from) yield next.value.subarray(from, to);
      }
      if (read !== block.bytes) throw new Error('Stored archive block is incomplete.');
    } finally {
      signal?.removeEventListener('abort', abort);
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}

async function build(client: Client, photos: ArchivePhoto[], size: ArchiveSize, folder: string, key: string): Promise<Manifest> {
  const started = Date.now();
  const prefix = `${folder}/${key}-${randomUUID()}`;
  const blocks: Block[] = [];
  const uploaded: string[] = [];
  const zip = createPhotoArchive(photos, size, async photo => {
    const { data, error } = await client.storage.from(photo.bucket).download(photo.storage_path);
    if (error || !data) throw new Error('A delivered photo could not be retrieved.');
    return data;
  }, AbortSignal.timeout(270_000));
  const audit = new ZipAudit();
  audit.resume();
  async function upload(bytes: Buffer) {
    const path = `${prefix}-${blocks.length}.zip`;
    uploaded.push(path);
    const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'application/zip', cacheControl: '3600', upsert: false,
    });
    if (error) throw new Error('The complete archive could not be stored.');
    blocks.push({ path, bytes: bytes.length });
  }
  try {
    let block = Buffer.allocUnsafe(STORAGE_BLOCK_BYTES);
    let used = 0;
    for await (const value of zip.archive) {
      const chunk = Buffer.from(value);
      audit.write(chunk);
      for (let offset = 0; offset < chunk.length;) {
        const length = Math.min(block.length - used, chunk.length - offset);
        chunk.copy(block, used, offset, offset + length);
        used += length; offset += length;
        if (used === block.length) {
          await upload(block);
          block = Buffer.allocUnsafe(STORAGE_BLOCK_BYTES); used = 0;
        }
      }
    }
    if (used) await upload(block.subarray(0, used));
    audit.end();
    const completed = await zip.done;
    const generated = audit.result(photos.length);
    if (completed.bytes !== generated.bytes) throw new Error('Archive byte count mismatch.');
    const storedAudit = new ZipAudit();
    storedAudit.resume();
    for await (const chunk of storedBytes(client, blocks)) storedAudit.write(Buffer.from(chunk));
    storedAudit.end();
    const stored = storedAudit.result(photos.length);
    if (stored.bytes !== generated.bytes || stored.sha256 !== generated.sha256) throw new Error('Stored archive checksum mismatch.');
    const manifest: Manifest = { version: 2, blocks, count: photos.length, ...stored, createdAt: Date.now() };
    const { error: manifestError } = await client.storage.from(BUCKET).upload(`${folder}/${key}.json`, JSON.stringify(manifest), {
      contentType: 'application/json', cacheControl: '0', upsert: true,
    });
    if (manifestError) throw new Error('The download could not be finalized.');
    console.info(JSON.stringify({ scope: 'gallery.archive', event: 'verified', size, count: photos.length,
      bytes: stored.bytes, elapsedMs: Date.now() - started, rssMiB: Math.round(process.memoryUsage().rss / 1048576) }));
    return manifest;
  } catch (error) {
    zip.cancel(); audit.destroy();
    await client.storage.from(BUCKET).remove(uploaded).catch(() => undefined);
    throw error;
  }
}

function archiveKey(photos: ArchivePhoto[], size: ArchiveSize) {
  return createHash('sha256').update(JSON.stringify(['zip-v2', size, photos])).digest('hex');
}

/** Call only AFTER checking gallery token, expiry, payment and selected photos. */
export async function preparePhotoArchive(client: Client, photos: ArchivePhoto[], orderId: string, size: ArchiveSize, filename: string) {
  const key = archiveKey(photos, size);
  const cachePath = `${orderId}/${key}.json`;
  let manifest = await readManifest(client, cachePath, photos.length);
  if (!manifest) {
    let work = running.get(cachePath);
    if (!work) {
      if (running.size >= 2) throw new ArchiveBusyError('Other downloads are being prepared. Please try again shortly.');
      work = build(client, photos, size, orderId, key);
      running.set(cachePath, work);
      void work.finally(() => running.delete(cachePath)).catch(() => undefined);
    }
    manifest = await work;
  }
  return { archiveKey: key, filename, photoCount: manifest.count, bytes: manifest.bytes,
    sha256: manifest.sha256, verified: true, expiresAt: Math.min(Date.now() + 3600_000, manifest.createdAt + CACHE_MS) };
}

/** Recheck access in the route before serving. A stale key cannot fetch another selection. */
export async function preparedArchiveResponse(client: Client, photos: ArchivePhoto[], orderId: string, size: ArchiveSize, filename: string, req: Request) {
  const key = new URL(req.url).searchParams.get('archive');
  if (key !== archiveKey(photos, size)) return new Response('Gallery changed. Refresh and prepare a new download.', { status: 409 });
  const manifest = await readManifest(client, `${orderId}/${key}.json`, photos.length);
  if (!manifest) return new Response('Download expired. Refresh and prepare a new download.', { status: 410 });
  const etag = `"${manifest.sha256}"`;
  let start = 0, end = manifest.bytes - 1;
  const range = req.headers.get('range');
  const ifRange = req.headers.get('if-range');
  const partial = !!range && (!ifRange || ifRange === etag);
  if (partial) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range!);
    if (match && (match[1] || match[2])) {
      if (!match[1]) start = Math.max(0, manifest.bytes - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    } else start = manifest.bytes;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= manifest.bytes) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${manifest.bytes}` } });
    }
  }
  const source = Readable.from(storedBytes(client, manifest.blocks, start, end, req.signal), { objectMode: false, highWaterMark: 64 * 1024 });
  const body = Readable.toWeb(source, { strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } }) as ReadableStream<Uint8Array>;
  return new Response(body, { status: partial ? 206 : 200, headers: {
    'content-type': 'application/zip', 'content-disposition': `attachment; filename="${filename.replace(/["\r\n]/g, '')}"`,
    'content-length': String(end - start + 1), 'accept-ranges': 'bytes', etag,
    ...(partial ? { 'content-range': `bytes ${start}-${end}/${manifest.bytes}` } : {}),
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
  } });
}
