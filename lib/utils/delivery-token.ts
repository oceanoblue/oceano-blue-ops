import { randomBytes, createHash } from 'crypto';

/** Generate a url-safe random token for a delivery link. */
export function generateDeliveryToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Hash a password for delivery link gating (sha256 + secret). */
export function hashPassword(password: string): string {
  const secret = process.env.DELIVERY_LINK_SECRET || '';
  return createHash('sha256').update(password + secret).digest('hex');
}
