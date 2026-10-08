import { expect, it, vi } from 'vitest';
import { prepareArchiveSet } from './archive-set';
import { preparePhotoArchive } from './prepared-archive';
vi.mock('./prepared-archive', () => ({ preparePhotoArchive: vi.fn() }));
it('prepares exactly one archive even for a gallery exceeding the old split limit', async () => {
  vi.mocked(preparePhotoArchive).mockResolvedValue({ archiveKey: 'key', photoCount: 10 } as any);
  const photos = Array.from({ length: 10 }, (_, i) => ({ filename: `${i}.jpg`, storage_path: `${i}.jpg`, bucket: 'photos', byte_size: 100_000_000 }));
  const result = await prepareArchiveSet({} as any, photos, 'order', 'full', 'all.zip');
  expect(preparePhotoArchive).toHaveBeenCalledTimes(1);
  expect(vi.mocked(preparePhotoArchive).mock.calls[0][1]).toHaveLength(10);
  expect(result.photoCount).toBe(10);
});
