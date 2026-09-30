import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/** Call only after the gallery/portal has checked publication, ownership and payment. */
export async function signDeliverableFile(
  client: SupabaseClient<Database>,
  file: { bucket: string; storage_path: string; filename: string | null },
) {
  const storage = client.storage.from(file.bucket);
  const [preview, download] = await Promise.all([
    storage.createSignedUrl(file.storage_path, 3600),
    // Content-Disposition is required: browsers ignore `download` on cross-origin preview URLs.
    storage.createSignedUrl(file.storage_path, 3600, { download: file.filename || true }),
  ]);
  return { url: preview.data?.signedUrl ?? null, downloadUrl: download.data?.signedUrl ?? null };
}
