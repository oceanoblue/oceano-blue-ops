import { describe, expect, it } from 'vitest';
import { createPhotoArchive, archiveWebStream } from './photo-archive';

const photos = (count: number) => Array.from({ length: count }, (_, i) => ({ filename: `Photo-${i}.jpg`, bucket: 'test', storage_path: `photo-${i}` }));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('bounded gallery ZIP streaming', () => {
  it('finishes all 156 entries and over 1.4GB without collecting the archive in memory', async () => {
    let opened = 0;
    const bytesPerPhoto = 9 * 1024 * 1024;
    const zip = createPhotoArchive(photos(156), 'full', async () => {
      opened += 1;
      return new Blob([Buffer.alloc(bytesPerPhoto, opened % 255)]);
    });
    const reader = archiveWebStream(zip.archive).getReader();
    await reader.read();
    await pause(100);
    // A slow browser must not cause all 156 source files to be prefetched.
    expect(opened).toBeLessThanOrEqual(2);
    let tail = Buffer.alloc(0);
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      tail = Buffer.concat([tail, Buffer.from(part.value).subarray(-22)]).subarray(-22);
    }
    const result = await zip.done;
    expect(opened).toBe(156);
    expect(result.count).toBe(156);
    expect(result.bytes).toBeGreaterThan(bytesPerPhoto * 156);
    expect(tail.readUInt32LE(0)).toBe(0x06054b50);
    expect(tail.readUInt16LE(10)).toBe(156);
    reader.releaseLock();
  }, 120_000);

  it('cancels active work and never continues through the rest of the gallery', async () => {
    let opened = 0;
    const zip = createPhotoArchive(photos(156), 'full', async () => { opened++; return new Blob([Buffer.alloc(2 * 1024 * 1024)]); });
    const reader = archiveWebStream(zip.archive).getReader();
    await reader.read();
    await reader.cancel();
    await expect(zip.done).rejects.toThrow();
    const stoppedAt = opened;
    await pause(50);
    expect(opened).toBe(stoppedAt);
    expect(opened).toBeLessThan(156);
  });

  it('fails instead of silently skipping a missing source photo', async () => {
    let opened = 0;
    const zip = createPhotoArchive(photos(3), 'full', async () => {
      if (++opened === 2) throw new Error('Storage unavailable');
      return new Blob(['original photo']);
    });
    await expect(new Response(archiveWebStream(zip.archive)).arrayBuffer()).rejects.toThrow();
    await expect(zip.done).rejects.toThrow();
    expect(opened).toBe(2);
  });

  it('fails a web conversion instead of quietly delivering the full-size original', async () => {
    const zip = createPhotoArchive(photos(1), 'web', async () => new Blob(['not an image']));
    await expect(new Response(archiveWebStream(zip.archive)).arrayBuffer()).rejects.toThrow();
    await expect(zip.done).rejects.toThrow();
  });

  it('rejects empty galleries before returning ZIP headers', () => {
    expect(() => createPhotoArchive([], 'full', async () => new Blob())).toThrow('No delivered photos');
  });
});
