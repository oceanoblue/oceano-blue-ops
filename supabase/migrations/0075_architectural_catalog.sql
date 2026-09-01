-- =============================================================
-- 0075 — Builder & Architectural catalog (from the price sheet)
-- =============================================================
-- Replaces the 0074 placeholder architectural products with the real catalog.
-- Per owner: NO Feature / Signature packages and NO builder program — just the
-- Photo and Video base packages + the à-la-carte add-ons, tagged {architectural}
-- so they only show on /book/architectural.
-- =============================================================

-- 1. Remove the 0074 placeholders.
delete from pricing_tiers where product_id in (select id from products where slug in ('arch_half_day', 'arch_full_day'));
delete from products where slug in ('arch_half_day', 'arch_full_day');

-- 2. The architectural add-ons are priced differently from real estate (e.g.
--    twilight $65 vs $150), so un-share the RE add-ons from the architectural
--    link — architectural gets its own set below.
update products set audiences = array_remove(audiences, 'architectural')
 where slug in ('drone_photography', 'twilight', 'same_day_delivery');

-- 3. Base packages.
insert into products (slug, name, kind, short_description, long_description, base_price_cents, duration_minutes, is_addon, is_active, sort_order, audiences) values
  ('arch_photo', 'Builder & Architectural — Photo', 'photo',
   'Interior, exterior & detail photography + drone stills',
   'Interior, exterior, and architectural detail photography, plus drone stills. 25–80 fully-edited images depending on size. Stills delivered in 48 hours. Unlimited builder and agency use. Priced by heated square footage; 7,500+ sq ft is custom-quoted.',
   75000, 120, false, true, 10, array['architectural']),
  ('arch_video', 'Builder & Architectural — Video', 'video',
   '60–90s walkthrough film, licensed music, full color grade',
   'A 60 to 90 second walkthrough film with licensed music and a full color grade. Delivered within five business days. Unlimited builder and agency use.',
   55000, 90, false, true, 11, array['architectural'])
on conflict (slug) do nothing;

-- 4. Add-ons.
insert into products (slug, name, kind, short_description, long_description, base_price_cents, duration_minutes, is_addon, is_active, sort_order, audiences) values
  ('arch_drone_video', 'Drone video', 'addon', 'Motion aerials added to the film', 'Adds motion aerials to the walkthrough film.', 10000, 0, true, true, 20, array['architectural']),
  ('arch_social_cut', 'Additional vertical social cut', 'addon', 'Extra vertical cut for social', 'One additional vertical social cut (Reels / TikTok / Shorts).', 12500, 0, true, true, 21, array['architectural']),
  ('arch_twilight', 'Twilight exterior set', 'addon', 'Dusk exteriors of the completed home', 'A twilight exterior set — dusk photos of the completed home.', 6500, 0, true, true, 22, array['architectural']),
  ('arch_360_tour', '360° tour, hosted 12 months', 'tour', 'Interactive 360° tour, hosted 1 year', 'An interactive 360° virtual tour, hosted for 12 months.', 15000, 0, true, true, 23, array['architectural']),
  ('arch_floor_plan', 'Interactive floor plan', 'floor_plan', 'Clickable interactive floor plan', 'An interactive, clickable floor plan of the home.', 9500, 0, true, true, 24, array['architectural']),
  ('arch_virtual_staging', 'Virtual staging', 'addon', 'Digitally furnished rooms (per room)', 'Digital furniture staging, priced per room.', 4500, 0, true, true, 25, array['architectural']),
  ('arch_rush', '24-hour rush delivery', 'addon', 'Delivered within 24 hours', 'Rush the full edit to a 24-hour turnaround.', 10000, 0, true, true, 26, array['architectural']),
  ('arch_weekend', 'Weekend or holiday shoot', 'addon', 'Saturday / Sunday or holiday scheduling', 'Schedule the shoot on a weekend or holiday.', 7500, 0, true, true, 27, array['architectural'])
on conflict (slug) do nothing;

-- 5. Photo pricing tiers by heated sqft. base_price ($750) is the fallback for
--    7,500+ sq ft (custom-quoted; this keeps it from under-pricing large homes).
insert into pricing_tiers (product_id, min_sqft, max_sqft, price_cents)
select p.id, t.min_sqft, t.max_sqft, t.price_cents
from products p
cross join (values
  (null::int, 1500, 45000),
  (1501, 2500, 50000),
  (2501, 3500, 57500),
  (3501, 5000, 65000),
  (5001, 7500, 75000)
) as t(min_sqft, max_sqft, price_cents)
where p.slug = 'arch_photo'
  and not exists (select 1 from pricing_tiers pt where pt.product_id = p.id);
