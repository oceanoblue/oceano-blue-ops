import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Returns a signed URL for a photo. Team-only.
 * Used by the dashboard to render previews from private buckets.
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
  if (!photoId) return NextResponse.json({ error: 'photo_id required' }, { status: 400 });

  const { data: photo, error } = await supabase
    .from('photos')
    .select('storage_path, bucket')
    .eq('id', photoId)
    .single();
  if (error || !photo) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: signed, error: signErr } = await supabase.storage
    .from(photo.bucket)
    .createSignedUrl(photo.storage_path, ttl);
  if (signErr || !signed) {
    return NextResponse.json({ error: signErr?.message || 'sign_failed' }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl });
}
