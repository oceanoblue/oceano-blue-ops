import { NextResponse } from 'next/server';
import { z } from 'zod';
import { galleryAccess } from '@/lib/deliveries/token';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { isDeliverable } from '@/lib/photos/deliverable';

export const dynamic = 'force-dynamic';
const fields = 'id, photo_id, note, status, staff_response, created_at, updated_at';
const bodySchema = z.object({ id: z.string().uuid(), photo_id: z.string().uuid(), note: z.string().trim().min(1).max(2000) });
type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Context) {
  const { token } = await context.params;
  const access = await galleryAccess(token);
  if (access.error) return access.error;
  const { data, error } = await (access.admin as any).from('gallery_revision_requests')
    .select(fields).eq('delivery_link_id', access.link.id).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load requests.' }, { status: 503 });
  return NextResponse.json({ requests: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request, context: Context) {
  const limited = await enforceRateLimit(request, 'gallery-revision', 30, 3600);
  if (limited) return limited;
  const { token } = await context.params;
  const access = await galleryAccess(token);
  if (access.error) return access.error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a photo and enter a request of up to 2,000 characters.' }, { status: 400 });
  const { data: photo, error: photoError } = await access.admin.from('photos')
    .select('id, is_hdr, ai_provider').eq('id', parsed.data.photo_id).eq('order_id', access.link.order_id)
    .in('kind', ['processed','delivered']).eq('is_selected', true).maybeSingle();
  if (photoError) return NextResponse.json({ error: 'Unable to verify photo.' }, { status: 503 });
  if (!photo || !isDeliverable(photo)) return NextResponse.json({ error: 'Photo not available in this gallery.' }, { status: 404 });
  const table = () => (access.admin as any).from('gallery_revision_requests');
  const { data, error } = await table().insert({ ...parsed.data, order_id: access.link.order_id, delivery_link_id: access.link.id }).select(fields).single();
  if (error?.code === '23505') {
    const { data: prior } = await table().select(fields).eq('id', parsed.data.id).eq('delivery_link_id', access.link.id).maybeSingle();
    if (prior && prior.photo_id === parsed.data.photo_id && prior.note === parsed.data.note) return NextResponse.json({ request: prior });
    return NextResponse.json({ error: 'This request changed. Please start a new request.' }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: 'Unable to save request. Please retry.' }, { status: 503 });
  return NextResponse.json({ request: data }, { status: 201 });
}
