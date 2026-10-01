import { beforeEach, describe, expect, it, vi } from 'vitest';
import { partitionOriginals, prepareArchiveSet, type SizedArchivePhoto } from './archive-set';
import { preparePhotoArchive, ArchiveTooLargeError } from './prepared-archive';
import { createPhotoArchive, archiveWebStream } from './photo-archive';

vi.mock('./prepared-archive', async importOriginal => ({
  ...await importOriginal<typeof import('./prepared-archive')>(), preparePhotoArchive: vi.fn(),
}));
const prepare = vi.mocked(preparePhotoArchive);
const photos = (count: number, byte_size = 90_000_000): SizedArchivePhoto[] => Array.from({ length: count }, (_, i) => ({
  id: `photo-${i}`, filename: 'same.jpg', bucket: 'test', storage_path: `photo-${i}`, updated_at: '2026-01-01', byte_size,
}));
beforeEach(() => {
  prepare.mockReset();
  prepare.mockImplementation(async (_client, group, _order, _size, filename) => ({
    downloadUrl: `https://storage.test/${filename}`, filename, photoCount: group.length, bytes: 5000,
    verified: true, sha256: 'test-hash', expiresAt: Date.now() + 3_600_000,
  }));
});

describe('size-aware complete archive sets', () => {
  it('partitions originals without losing, duplicating or reordering photos', () => {
    const original = photos(8);
    const groups = partitionOriginals(original);
    expect(groups.map(group => group.length)).toEqual([2, 2, 2, 2]);
    expect(groups.flat()).toEqual(original);
    expect(partitionOriginals([])).toEqual([]);
  });
  it('bounds unknown file sizes conservatively and retains oversized individual photos', () => {
    expect(partitionOriginals(photos(20).map(photo => ({ ...photo, byte_size: null })))).toHaveLength(3);
    expect(partitionOriginals(photos(2, 500_000_000))).toHaveLength(2);
  });
  it('keeps one web ZIP and preserves its existing cache fingerprint inputs', async () => {
    const input = photos(8);
    const result = await prepareArchiveSet({} as any, input, 'order', 'web', 'gallery-web.zip');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0][1][0]).not.toHaveProperty('byte_size');
    expect(prepare.mock.calls[0][1][0]).not.toHaveProperty('archiveIndex');
    expect(result.downloads).toHaveLength(1);
    expect(result.downloadUrl).toBe('https://storage.test/gallery-web.zip');
    expect(result.photoCount).toBe(8);
  });
  it('returns every verified original part and global photo sequence', async () => {
    const result = await prepareArchiveSet({} as any, photos(8), 'order', 'full', 'gallery.zip');
    expect(result.downloadUrl).toBeNull();
    expect(result.photoCount).toBe(8);
    expect(result.downloads).toHaveLength(4);
    expect(result.downloads.map(file => [file.firstPhoto, file.lastPhoto])).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]]);
    expect(prepare.mock.calls.flatMap(call => call[1]).map(photo => photo.archiveIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.downloads[3].filename).toBe('gallery-photos-007-008.zip');
  });
  it('adapts to a lower project limit without treating partial delivery as success', async () => {
    prepare.mockRejectedValueOnce(new ArchiveTooLargeError('size limit'));
    const result = await prepareArchiveSet({} as any, photos(4, 1000), 'order', 'full', 'gallery.zip');
    expect(result.downloads.map(file => file.photoCount)).toEqual([2, 2]);
    expect(result.photoCount).toBe(4);
    expect(prepare.mock.calls[2][1][0].archiveIndex).toBe(2);
  });
  it('does not conceal a missing photo by returning earlier successful parts', async () => {
    prepare.mockResolvedValueOnce({ downloadUrl: 'https://storage.test/first', filename: 'first.zip', photoCount: 2, bytes: 1000,
      verified: true, sha256: 'test', expiresAt: Date.now() + 3_600_000 });
    prepare.mockRejectedValueOnce(new Error('Missing source'));
    await expect(prepareArchiveSet({} as any, photos(8), 'order', 'full', 'gallery.zip')).rejects.toThrow('Missing source');
    expect(prepare).toHaveBeenCalledTimes(2);
  });
  it('cannot loop when one file itself exceeds storage limits', async () => {
    prepare.mockRejectedValue(new ArchiveTooLargeError('size limit'));
    await expect(prepareArchiveSet({} as any, photos(1), 'order', 'full', 'gallery.zip')).rejects.toThrow('size limit');
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it('writes globally unique sequence prefixes into actual separate ZIP entries', async () => {
    const group = photos(2, 4).map((photo, index) => ({ ...photo, archiveIndex: index + 26, archiveTotal: 168 }));
    const zip = createPhotoArchive(group, 'full', async () => new Blob(['original']));
    const bytes = Buffer.from(await new Response(archiveWebStream(zip.archive)).arrayBuffer());
    expect((await zip.done).count).toBe(2);
    expect(bytes.includes(Buffer.from('027-same.jpg'))).toBe(true);
    expect(bytes.includes(Buffer.from('028-same.jpg'))).toBe(true);
    expect(bytes.includes(Buffer.from('001-same.jpg'))).toBe(false);
  });
});
