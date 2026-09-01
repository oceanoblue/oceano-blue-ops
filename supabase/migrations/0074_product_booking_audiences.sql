-- =============================================================
-- 0074 — Booking audiences on products (real estate vs architectural)
-- =============================================================
-- The public booking wizard is now served at two links: /book (real estate) and
-- /book/architectural (construction / architectural clients). Each product
-- declares which link(s) it appears on via `audiences`, so a construction client
-- never sees MLS packages and vice-versa. Existing products default to
-- {real_estate}, so /book is unchanged.
-- =============================================================

alter table products
  add column if not exists audiences text[] not null default '{real_estate}';

-- A few add-ons apply to both markets — surface them on the architectural link too.
update products
   set audiences = array(select distinct unnest(audiences || array['architectural']))
 where slug in ('drone_photography', 'twilight', 'same_day_delivery');

-- Starter architectural packages. PLACEHOLDER prices — edit them (and add more)
-- in Dashboard → Products before sharing the link. Tagged {architectural} so they
-- only show on /book/architectural.
insert into products
  (slug, name, kind, short_description, long_description, base_price_cents, duration_minutes, is_addon, is_active, sort_order, audiences)
values
  ('arch_half_day', 'Architectural Photography — Half Day', 'photo',
   'Up to ~4 hours on site',
   'Technically-accurate architectural coverage — exteriors, interiors, and detail shots, professionally graded true-to-life (sober, not HDR-punchy). Half-day session.',
   45000, 240, false, true, 10, array['architectural']),
  ('arch_full_day', 'Architectural Photography — Full Day', 'photo',
   'Full day on site',
   'Comprehensive architectural coverage for larger projects — full building, multiple angles, details, and context. Full-day session.',
   75000, 480, false, true, 11, array['architectural'])
on conflict (slug) do nothing;
