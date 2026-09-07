import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed, login-free links for a contractor to accept / decline a shoot from
 * the assignment email or the calendar invite. The token binds ONE order to
 * ONE contractor; it stops working the moment the shoot is reassigned (the
 * contractor id no longer matches) and after `exp`.
 *
 * Format: base64url(json payload) . base64url(hmac-sha256)
 */
export interface RespondTokenPayload {
  o: string; // order id
  c: string; // contractor id
  exp: number; // unix seconds
}

const DEFAULT_TTL_DAYS = 60;

function secret(): string | null {
  return process.env.RESPOND_LINK_SECRET || process.env.DELIVERY_LINK_SECRET || null;
}

function sign(data: string, key: string): string {
  return createHmac('sha256', key).update(data).digest('base64url');
}

/**
 * Expiry for a shoot's respond link: a month past the shoot date, or 60 days
 * from now when it isn't scheduled yet. Derived from the shoot, not the clock,
 * so re-signing for the same shoot yields the SAME token (the calendar sync
 * embeds it in the event description and must not churn it).
 */
export function respondTokenExpiry(scheduledAt: string | Date | null | undefined): number {
  const t = scheduledAt ? new Date(scheduledAt).getTime() : NaN;
  if (!Number.isNaN(t)) return Math.floor(t / 1000) + 30 * 86_400;
  return Math.floor(Date.now() / 1000) + DEFAULT_TTL_DAYS * 86_400;
}

/** Returns null when no signing secret is configured. `exp` in unix seconds. */
export function signRespondToken(
  orderId: string,
  contractorId: string,
  exp: number = Math.floor(Date.now() / 1000) + DEFAULT_TTL_DAYS * 86_400
): string | null {
  const key = secret();
  if (!key) return null;
  const payload: RespondTokenPayload = { o: orderId, c: contractorId, exp };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, key)}`;
}

/** Returns the payload when the signature is valid and not expired, else null. */
export function verifyRespondToken(token: string | null | undefined): RespondTokenPayload | null {
  const key = secret();
  if (!key || !token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as RespondTokenPayload;
    if (!p?.o || !p?.c || typeof p.exp !== 'number') return null;
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

/** The page a contractor lands on to confirm their answer. */
export function respondPageUrl(base: string, token: string, choice?: 'accepted' | 'declined'): string {
  const u = `${base.replace(/\/$/, '')}/field/respond/${encodeURIComponent(token)}`;
  return choice ? `${u}?choice=${choice}` : u;
}
