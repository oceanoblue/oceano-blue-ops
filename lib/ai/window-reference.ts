import sharp from 'sharp';
import type { SourceImage } from './types';

/** Only an actual merge's inputs establish that frames depict the same capture.
 * Never borrow a dark photo merely because it belongs to the same order. */
export async function findWindowReference(admin: any, photoId: string, orderId: string): Promise<{ source: SourceImage; photoId: string } | null> {
  const seen = new Set<string>();
  let current: string | null = photoId;
  for (let depth = 0; current && depth < 20 && !seen.has(current); depth++) {
    seen.add(current);
    const { data: photo }: { data: { id: string; order_id: string; parent_photo_id: string | null; source_job_id: string | null } | null } = await admin.from('photos').select('id, order_id, parent_photo_id, source_job_id').eq('id', current).eq('order_id', orderId).maybeSingle();
    if (!photo) return null;
    if (photo.source_job_id) {
      const { data: job } = await admin.from('ai_jobs').select('job_type, input_photo_ids').eq('id', photo.source_job_id).eq('order_id', orderId).maybeSingle();
      if (job?.job_type === 'hdr_merge' && job.input_photo_ids?.length > 1) {
        const { data: frames } = await admin.from('photos').select('id, bucket, storage_path, filename, exif').in('id', job.input_photo_ids).eq('order_id', orderId);
        const candidates = (frames ?? []).filter((f: any) => {
          const ev = f.exif?.ExposureBiasValue;
          return typeof ev === 'number' && Number.isFinite(ev) && ev <= -0.5;
        }).sort((a: any, b: any) => a.exif.ExposureBiasValue - b.exif.ExposureBiasValue);
        for (const frame of candidates) {
          const { data, error } = await admin.storage.from(frame.bucket).download(frame.storage_path);
          if (error || !data) continue;
          try {
            // Stored camera JPEG previews retain the darker capture. Never grade
            // or auto-expose a window reference, and never send EXIF to the model.
            const bytes = await sharp(Buffer.from(await data.arrayBuffer())).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 96, chromaSubsampling: '4:4:4' }).toBuffer();
            return { source: { bytes, filename: 'same-capture-dark-reference.jpg', mimeType: 'image/jpeg', bracketIndex: frame.exif.ExposureBiasValue }, photoId: frame.id };
          } catch { /* An undecodable RAW is not usable window evidence. */ }
        }
        return null;
      }
    }
    current = photo.parent_photo_id;
  }
  return null;
}
