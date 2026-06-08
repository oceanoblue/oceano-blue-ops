/**
 * Batch-sign thumbnail storage paths into temporary URLs for rendering.
 * Server-only (uses the Supabase storage API with the request's session).
 * Thumbnails live in the private `thumbnails` bucket; full-res originals are
 * never uploaded, so these previews are all we sign.
 */
export async function signThumbnails(
  supabase: any,
  paths: Array<string | null | undefined>,
  ttl = 3600
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return {};
  const { data } = await supabase.storage.from('thumbnails').createSignedUrls(unique, ttl);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row?.path && row?.signedUrl) map[row.path] = row.signedUrl;
  }
  return map;
}
