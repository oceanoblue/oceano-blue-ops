-- Download paywall: an order's delivered media is locked (watermarked previews,
-- no downloads) until the client pays. Payment is recorded on the ORDER so a
-- single payment unlocks every surface that order's media appears on (the
-- shared gallery link today, the realtor portal next).
--
-- The whole feature stays dormant until STRIPE_SECRET_KEY is set in the app
-- environment; these columns are simply null until then.

alter table public.orders
  add column if not exists download_paid_at timestamptz,
  add column if not exists download_paid_cents integer,
  add column if not exists download_stripe_session_id text;

comment on column public.orders.download_paid_at is
  'When the client paid to unlock downloads for this order (null = locked/unpaid).';
comment on column public.orders.download_paid_cents is
  'Amount captured (cents) when unlocking downloads.';
comment on column public.orders.download_stripe_session_id is
  'Stripe Checkout Session id that unlocked this order (idempotency + audit).';
