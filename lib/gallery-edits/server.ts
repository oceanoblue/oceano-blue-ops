import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { galleryAccess } from '@/lib/deliveries/token';
import { paywallFor } from '@/lib/payments/gate';

// New tables are isolated until the next full generated schema refresh.
export const editDb = () => createAdminClient({ noStore: true }) as any;
export const privateHeaders = { 'Cache-Control': 'private, no-store' };
export const editJson = (body: unknown, status = 200) => Response.json(body, { status, headers: privateHeaders });
export const providerAvailable = () => Boolean(process.env.OPENAI_API_KEY);
export async function editAccess(token: string) {
  const access = await galleryAccess(token);
  if (access.error) return access;
  const { data: order, error } = await access.admin.from('orders').select('id, listing_id, total_cents, download_paid_at').eq('id', access.link.order_id).maybeSingle();
  if (error) return { ...access, error: editJson({ error: 'Gallery unavailable.' }, 503) };
  if (!order?.listing_id) return { ...access, error: editJson({ error: 'Gallery unavailable.' }, 404) };
  if (paywallFor(order).active) return { ...access, error: editJson({ error: 'Complete payment to use photo edits.' }, 402) };
  return access;
}
export async function readSmallJson(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 4096) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return null; }
}
export async function limitEdits(request: Request, scope: string, limit: number) {
  // Unlike booking's fail-open limiter, paid generation must fail closed.
  const { createHash } = await import('node:crypto');
  const { clientIp, windowBucket } = await import('@/lib/security/rate-limit');
  try {
    const ip = createHash('sha256').update(clientIp(request)).digest('hex');
    const { data, error } = await editDb().rpc('bump_rate_limit', { p_key: `gallery-edits:${scope}:${ip}:${windowBucket(Date.now(), 60)}` });
    if (error || !Number.isSafeInteger(data) || data < 1) return editJson({ error: 'Please try again shortly.' }, 503);
    if (data > limit) return editJson({ error: 'Too many requests. Please try again in a minute.' }, 429);
    return null;
  } catch { return editJson({ error: 'Please try again shortly.' }, 503); }
}
