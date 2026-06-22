import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Returns a signed URL for a photo. Team-only.
 * Used by the dashboard to render previews from private buckets.
 *
 * Pass `w` to get a resized thumbnail (Supabase image transform) instead of the
 * full-resolution original — the review grids show dozens of photos at once, and
 * loading multi-MB / 4000px images for tiny tiles exhausts browser decode memory
 * (images fail to render). The loupe omits `w` to get the full image.
 */
export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const photoId = url.searchParams.get('photo_id');
  const ttl = Math.min(Number(url.searchParams.get('ttl') ?? 3600), 86400);
  const w = Math.min(Math.max(Number(url.searchParams.get('w') ?? 0), 0), 2000);
  if (!photoId) return NextResponse.json({ error: 'photo_id required' }, { status: 400 });

  const { data: photo, error } = await supabase
    .from('photos')
    .select('storage_path, bucket')
    .eq('id', photoId)
    .single();
  if (error || !photo) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const transform = w > 0 ? { transform: { width: w, resize: 'contain' as const, quality: 78 } } : undefined;
  const { data: signed } = await supabase.storage
    .from(photo.bucket)
    .createSignedUrl(photo.storage_path, ttl, transform);
  if (signed) return NextResponse.json({ url: signed.signedUrl });

  // Image transforms may be unavailable on the plan — fall back to the original.
  if (transform) {
    const { data: plain } = await supabase.storage
      .from(photo.bucket)
      .createSignedUrl(photo.storage_path, ttl);
    if (plain) return NextResponse.json({ url: plain.signedUrl });
  }
  return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
}
