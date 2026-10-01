import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { createAdminClient } from '@/lib/supabase/server';
import { createPhotoArchive, type ArchivePhoto, type ArchiveSize } from './photo-archive';

const BUCKET = 'gallery-downloads';
const CACHE_MS = 24 * 60 * 60 * 1000;
type Client = ReturnType<typeof createAdminClient>;
type Manifest = { version: number; path: string; count: number; bytes: number; sha256: string; createdAt: number };
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
    this.tail = Buffer.concat([this.tail, chunk.subarray(Math.max(0, chunk.length - 22))]).subarray(-22);
    callback(null, chunk);
  }
  result(expectedCount: number) {
    if (this.tail.length !== 22 || this.tail.readUInt32LE(0) !== 0x06054b50 ||
        this.tail.readUInt16LE(10) !== expectedCount || this.tail.readUInt16LE(20) !== 0 ||
        this.tail.readUInt32LE(12) + this.tail.readUInt32LE(16) !== this.bytes - 22) {
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
    if (manifest.version === 1 && manifest.count === count && manifest.bytes > 22 &&
        typeof manifest.path === 'string' && manifest.path.startsWith(path.slice(0, path.lastIndexOf('/') + 1)) &&
        typeof manifest.sha256 === 'string' && Date.now() - manifest.createdAt < CACHE_MS) return manifest;
  } catch { /* An invalid/old cache never authorizes a download. Rebuild it. */ }
  return null;
}

async function build(client: Client, photos: ArchivePhoto[], size: ArchiveSize, folder: string, key: string): Promise<Manifest> {
  const started = Date.now();
  const path = `${folder}/${key}-${randomUUID()}.zip`;
  const zip = createPhotoArchive(photos, size, async photo => {
    const { data, error } = await client.storage.from(photo.bucket).download(photo.storage_path);
    if (error || !data) throw new Error('A delivered photo could not be retrieved.');
    return data;
  });
  const audit = new ZipAudit();
  const pumping = pipeline(zip.archive, audit);
  void pumping.catch(() => zip.cancel());
  try {
    const { error } = await client.storage.from(BUCKET).upload(path, audit, {
      contentType: 'application/zip', cacheControl: '3600', upsert: false, duplex: 'half',
    });
    if (error) throw new Error('The complete archive could not be stored.');
    await pumping;
    const completed = await zip.done;
    const generated = audit.result(photos.length);
    if (completed.bytes !== generated.bytes) throw new Error('Archive byte count mismatch.');

    // Read the committed storage object back as a stream. This verifies the
    // actual uploaded bytes, not just an HTTP 200 or a synthetic sample image.
    const { data, error: readError } = await client.storage.from(BUCKET).download(path).asStream();
    if (readError || !data) throw new Error('The stored archive could not be verified.');
    const storedAudit = new ZipAudit();
    storedAudit.resume(); // Discard audited chunks; do NOT accumulate in memory.
    const reader = data.getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        if (!storedAudit.write(Buffer.from(next.value))) {
          await new Promise<void>(resolve => storedAudit.once('drain', resolve));
        }
      }
      storedAudit.end();
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    const stored = storedAudit.result(photos.length);
    if (stored.bytes !== generated.bytes || stored.sha256 !== generated.sha256) throw new Error('Stored archive checksum mismatch.');
    const manifest: Manifest = { version: 1, path, count: photos.length, ...stored, createdAt: Date.now() };
    const { error: manifestError } = await client.storage.from(BUCKET).upload(`${folder}/${key}.json`, JSON.stringify(manifest), {
      contentType: 'application/json', cacheControl: '0', upsert: true,
    });
    if (manifestError) throw new Error('The download could not be finalized.');
    console.info(JSON.stringify({ scope: 'gallery.archive', event: 'verified', size, count: photos.length,
      bytes: stored.bytes, elapsedMs: Date.now() - started, rssMiB: Math.round(process.memoryUsage().rss / 1048576) }));
    return manifest;
  } catch (error) {
    zip.cancel(); audit.destroy();
    await pumping.catch(() => undefined);
    await client.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw error;
  }
}

/** Call only AFTER checking gallery token, expiry, payment and selected photos.
 * Signed downloads are short-lived; no public bucket or client storage policy.
 */
export async function preparePhotoArchive(client: Client, photos: ArchivePhoto[], orderId: string, size: ArchiveSize, filename: string) {
  const key = createHash('sha256').update(JSON.stringify(['zip-v1', size, photos])).digest('hex');
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
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(manifest.path, 3600, { download: filename });
  if (error || !data?.signedUrl) throw new Error('A download link could not be created.');
  return { downloadUrl: data.signedUrl, filename, photoCount: manifest.count, bytes: manifest.bytes,
    sha256: manifest.sha256, verified: true, expiresAt: Date.now() + 3600_000 };
}
