import type { createAdminClient } from '@/lib/supabase/server';
import type { ArchivePhoto, ArchiveSize } from './photo-archive';
import { preparePhotoArchive } from './prepared-archive';
export type SizedArchivePhoto = ArchivePhoto & { byte_size?: number | string | null };
export function archiveSources(photos: SizedArchivePhoto[]): ArchivePhoto[] {
  return photos.map(({ byte_size: _bytes, ...photo }) => photo);
}
/** Every resolution produces one complete ZIP, regardless of source file sizes. */
export async function prepareArchiveSet(client: ReturnType<typeof createAdminClient>, photos: SizedArchivePhoto[], orderId: string, size: ArchiveSize, filename: string) {
  if (!photos.length) throw new Error('No delivered photos are available.');
  return preparePhotoArchive(client, archiveSources(photos), orderId, size, filename);
}
