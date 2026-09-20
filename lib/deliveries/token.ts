import { createAdminClient } from '@/lib/supabase/server';

/** An existing, unexpired gallery token grants access only to its order. */
export async function galleryAccess(token: string) {
  const admin = createAdminClient({ noStore: true });
  const { data: link, error } = await admin.from('delivery_links')
    .select('id, order_id, expires_at').eq('token', token).maybeSingle();
  if (error) return { error: new Response('Gallery unavailable', { status: 503 }), admin, link: null };
  if (!link) return { error: new Response('Gallery not found', { status: 404 }), admin, link: null };
  if (link.expires_at && new Date(link.expires_at) <= new Date()) {
    return { error: new Response('Gallery expired', { status: 410 }), admin, link: null };
  }
  return { error: null, admin, link };
}
