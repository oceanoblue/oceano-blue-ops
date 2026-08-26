-- Quotes serve two distinct client types with different pricing:
--   realtor  — single listings (à-la-carte, residential rates; the live catalog)
--   builder  — builders / construction / architects (packages, more time and
--              detail photos, higher rates; priced from lib/quotes/builder-pricing.ts)
-- Realtor pricing lives in products + pricing_tiers; builder pricing is a fixed
-- sheet in code, so this migration only tags which track a quote belongs to.
alter table public.quotes
  add column if not exists client_type text not null default 'realtor';
