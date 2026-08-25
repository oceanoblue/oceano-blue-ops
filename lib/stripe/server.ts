import Stripe from 'stripe';

/**
 * Lazily-constructed Stripe client. Returns null when STRIPE_SECRET_KEY is not
 * set, which is how the whole download-paywall stays DORMANT until the keys are
 * added in the environment — callers treat "no client" as "paywall disabled".
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) {
    // Pin nothing: the SDK uses the account's default API version, which keeps
    // us off a version treadmill for a simple Checkout + webhook integration.
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/** True when Stripe secret key is configured. Gates all paywall behaviour. */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Absolute base URL for building Checkout success/cancel redirects. Prefers the
 * explicit app URL, falls back to the Vercel deployment URL, then the incoming
 * request's own origin.
 */
export function getBaseUrl(req?: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  if (req) {
    try {
      return new URL(req.url).origin;
    } catch {
      /* fall through */
    }
  }
  return 'https://app.oceanoblue.net';
}
