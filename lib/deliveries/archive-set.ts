import type { createAdminClient } from '@/lib/supabase/server';
import type { ArchivePhoto, ArchiveSize } from './photo-archive';
import { preparePhotoArchive, ArchiveTooLargeError } from './prepared-archive';

export const ORIGINAL_PART_BYTES = 250_000_000;
export type SizedArchivePhoto = ArchivePhoto & { byte_size?: number | string | null };

/** Preserve order and every photo; a part is an ordinary ZIP, not a .z01 volume. */
export function partitionOriginals(photos: SizedArchivePhoto[], limit = ORIGINAL_PART_BYTES): SizedArchivePhoto[][] {
  const groups: SizedArchivePhoto[][] = [];
  let group: SizedArchivePhoto[] = [];
  let bytes = 0;
  for (const photo of photos) {
    const measured = Number(photo.byte_size);
    const cost = (Number.isFinite(measured) && measured > 0 ? measured : 32 * 1024 * 1024) + 1024;
    if (group.length && bytes + cost > limit) { groups.push(group); group = []; bytes = 0; }
    group.push(photo); bytes += cost;
  }
  if (group.length) groups.push(group);
  return groups;
}

type Client = ReturnType<typeof createAdminClient>;
type Download = Awaited<ReturnType<typeof preparePhotoArchive>> & { firstPhoto: number; lastPhoto: number };

/** Called after the route's existing access gates. Never return a partial set. */
export async function prepareArchiveSet(client: Client, photos: SizedArchivePhoto[], orderId: string, size: ArchiveSize, filename: string) {
  if (!photos.length) throw new Error('No delivered photos are available.');
  const groups = size === 'full' ? partitionOriginals(photos) : [photos];
  const downloads: Download[] = [];
  async function prepareGroup(group: SizedArchivePhoto[], offset: number): Promise<void> {
    const split = group.length !== photos.length;
    const numbered = group.map((photo, index) => {
      // Preserve existing single-archive cache fingerprints (e.g. a ready web ZIP).
      const { byte_size: _bytes, ...source } = photo;
      return split ? { ...source, archiveIndex: offset + index, archiveTotal: photos.length } : source;
    });
    const range = `${String(offset + 1).padStart(3, '0')}-${String(offset + group.length).padStart(3, '0')}`;
    const partName = split ? filename.replace(/\.zip$/i, `-photos-${range}.zip`) : filename;
    try {
      const ready = await preparePhotoArchive(client, numbered, orderId, size, partName);
      downloads.push({ ...ready, firstPhoto: offset + 1, lastPhoto: offset + group.length });
    } catch (error) {
      // A global project limit can be lower than the bucket limit. Divide only
      // on an explicit size rejection; a missing/corrupt photo still fails closed.
      if (!(error instanceof ArchiveTooLargeError) || group.length < 2) throw error;
      const middle = Math.ceil(group.length / 2);
      await prepareGroup(group.slice(0, middle), offset);
      await prepareGroup(group.slice(middle), offset + middle);
    }
  }
  let offset = 0;
  for (const group of groups) { await prepareGroup(group, offset); offset += group.length; }
  if (downloads.reduce((sum, file) => sum + file.photoCount, 0) !== photos.length) throw new Error('Archive photo count mismatch.');
  return {
    ...(downloads.length === 1 ? downloads[0] : { downloadUrl: null, filename }),
    photoCount: photos.length, bytes: downloads.reduce((sum, file) => sum + file.bytes, 0),
    verified: true, expiresAt: Math.min(...downloads.map(file => file.expiresAt)), downloads,
  };
}
