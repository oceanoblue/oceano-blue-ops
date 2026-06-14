import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Durable fixed-window rate limiting for public endpoints, backed by the
 * `rate_limits` table + `bump_rate_limit` RPC (migration 0037). Designed to be
 * fail-open: if the limiter itself errors we allow the request rather than
 * block a real customer mid-booking.
 */

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim() || 'unknown';
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** The integer window bucket an instant falls into, for fixed-window counting. */
export function windowBucket(nowMs: number, windowSeconds: number): number {
  return Math.floor(nowMs / 1000 / Math.max(1, windowSeconds));
}

/** Compose the storage key for a scope+ip+window. */
export function rateLimitKey(scope: string, ip: string, bucket: number): string {
  return `${scope}:${ip}:${bucket}`;
}

export interface RateLimitResult {
  ok: boolean;
  count: number;
  limit: number;
}

export async function rateLimit(opts: {
  scope: string;
  ip: string;
  limit: number;
  windowSeconds: number;
  now?: number;
}): Promise<RateLimitResult> {
  const { scope, ip, limit, windowSeconds } = opts;
  const key = rateLimitKey(scope, ip, windowBucket(opts.now ?? Date.now(), windowSeconds));
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('bump_rate_limit', { p_key: key } as any);
    if (error) return { ok: true, count: 0, limit }; // fail-open
    const count = typeof data === 'number' ? data : 0;
    return { ok: count <= limit, count, limit };
  } catch {
    return { ok: true, count: 0, limit }; // fail-open
  }
}

/**
 * Route guard: returns a 429 Response when over the limit, or null to proceed.
 * Only reads request headers (not the body), so it's safe to call before
 * parsing JSON.
 */
export async function enforceRateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowSeconds: number
): Promise<Response | null> {
  const res = await rateLimit({ scope, ip: clientIp(req), limit, windowSeconds });
  if (!res.ok) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(windowSeconds) } }
    );
  }
  return null;
}
