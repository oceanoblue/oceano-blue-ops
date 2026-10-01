import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { preparePhotoArchive, ZipAudit } from './prepared-archive';

function storage() {
  const objects = new Map<string, Buffer>();
  let corrupt = false;
  const signed = vi.fn(async (path: string) => ({ data: { signedUrl: `https://storage.test/${path}` }, error: null }));
  const upload = vi.fn(async (bucket: string, path: string, body: any) => {
    const chunks: Buffer[] = [];
    if (typeof body === 'string') chunks.push(Buffer.from(body));
    else for await (const chunk of body) chunks.push(Buffer.from(chunk));
    let bytes = Buffer.concat(chunks);
    if (corrupt && path.endsWith('.zip')) bytes = bytes.subarray(0, bytes.length - 22);
    objects.set(`${bucket}/${path}`, bytes);
    return { data: { path }, error: null };
  });
  const client = { storage: { from: (bucket: string) => ({
    download: (path: string) => {
      const bytes = objects.get(`${bucket}/${path}`);
      const data = bytes ? new Blob([new Uint8Array(bytes)]) : null;
      const error = data ? null : { statusCode: '404', message: 'Object not found' };
      return Object.assign(Promise.resolve({ data, error }), {
        asStream: async () => ({ data: data?.stream() ?? null, error }),
      });
    },
    upload: (path: string, body: any) => upload(bucket, path, body),
    remove: async (paths: string[]) => { paths.forEach(path => objects.delete(`${bucket}/${path}`)); return { error: null }; },
    createSignedUrl: signed,
  }) } };
  const photos = [{ id: 'photo', filename: 'Property.jpg', bucket: 'processed-photos', storage_path: 'master.jpg', updated_at: '2026-01-01' }];
  return { client: client as any, objects, photos, upload, signed, corrupt: () => { corrupt = true; } };
}

// Independent ZIP directory and CRC checks, not ZipAudit's footer-only check.
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function extract(zip: Buffer) {
  const end = zip.length - 22;
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const entries: { name: string; bytes: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
    expect(zip.readUInt16LE(offset + 10)).toBe(0); // ZIP STORE
    const crc = zip.readUInt32LE(offset + 16);
    const size = zip.readUInt32LE(offset + 20);
    const nameSize = zip.readUInt16LE(offset + 28);
    const extraSize = zip.readUInt16LE(offset + 30);
    const commentSize = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const bytes = zip.subarray(start, start + size);
    expect(crc32(bytes)).toBe(crc);
    entries.push({ name: zip.subarray(offset + 46, offset + 46 + nameSize).toString(), bytes });
    offset += 46 + nameSize + extraSize + commentSize;
  }
  expect(offset).toBe(end);
  return entries;
}

describe('prepared private photo archives', () => {
  it('reads back the stored ZIP, verifies every byte, then signs it; cached retries do not rebuild', async () => {
    const s = storage();
    const original = Buffer.from('original file bytes');
    s.objects.set('processed-photos/master.jpg', original);
    const ready = await preparePhotoArchive(s.client, s.photos, 'order-a', 'full', 'photos.zip');
    expect(ready.verified).toBe(true);
    expect(ready.photoCount).toBe(1);
    const bytes = [...s.objects].find(([key]) => key.endsWith('.zip'))![1];
    expect(ready.bytes).toBe(bytes.length);
    expect(ready.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(extract(bytes)[0].bytes.equals(original)).toBe(true);
    expect(s.signed).toHaveBeenCalledTimes(1);
    await preparePhotoArchive(s.client, s.photos, 'order-a', 'full', 'photos.zip');
    expect(s.upload).toHaveBeenCalledTimes(2); // One ZIP and one small manifest.
    expect(s.signed).toHaveBeenCalledTimes(2);
  });

  it('extracts and validates every web JPEG from a multi-photo stored archive', async () => {
    const s = storage();
    const original = await sharp({ create: { width: 4000, height: 2000, channels: 3, background: 'white' } }).jpeg().toBuffer();
    s.objects.set('processed-photos/master.jpg', original);
    const photos = Array.from({ length: 6 }, (_, i) => ({ ...s.photos[0], id: `photo-${i}`, filename: `Photo-${i}.jpg` }));
    const ready = await preparePhotoArchive(s.client, photos, 'order-b', 'web', 'web.zip');
    expect(ready.photoCount).toBe(6);
    const entries = extract([...s.objects].find(([key]) => key.endsWith('.zip'))![1]);
    expect(entries).toHaveLength(6);
    for (const [i, entry] of entries.entries()) {
      expect(entry.name).toBe(`${String(i + 1).padStart(3, '0')}-Photo-${i}-web.jpg`);
      const meta = await sharp(entry.bytes).metadata();
      expect([meta.width, meta.height, meta.format]).toEqual([2048, 1024, 'jpeg']);
    }
  });

  it('does not issue a link or keep a manifest when storage truncates the ZIP', async () => {
    const s = storage(); s.corrupt();
    s.objects.set('processed-photos/master.jpg', Buffer.from('source'));
    await expect(preparePhotoArchive(s.client, s.photos, 'order-c', 'full', 'photos.zip')).rejects.toThrow();
    expect(s.signed).not.toHaveBeenCalled();
    expect([...s.objects.keys()].filter(key => key.startsWith('gallery-downloads/'))).toHaveLength(0);
  });

  it('does not issue a link for a missing photo or fall back to an empty ZIP', async () => {
    const s = storage();
    await expect(preparePhotoArchive(s.client, s.photos, 'order-d', 'full', 'photos.zip')).rejects.toThrow();
    expect(s.signed).not.toHaveBeenCalled();
  });

  it('invalidates the cache when a delivered photo changes', async () => {
    const s = storage();
    s.objects.set('processed-photos/master.jpg', Buffer.from('first'));
    const a = await preparePhotoArchive(s.client, s.photos, 'order-e', 'full', 'photos.zip');
    s.objects.set('processed-photos/master.jpg', Buffer.from('replacement'));
    const b = await preparePhotoArchive(s.client, [{ ...s.photos[0], updated_at: '2026-01-02' }], 'order-e', 'full', 'photos.zip');
    expect(a.sha256).not.toBe(b.sha256);
    expect(a.downloadUrl).not.toBe(b.downloadUrl);
  });

  it('rejects bytes with no complete ZIP directory', () => {
    const audit = new ZipAudit(); audit.resume(); audit.end(Buffer.from('PK not a ZIP'));
    expect(() => audit.result(1)).toThrow();
  });
});
