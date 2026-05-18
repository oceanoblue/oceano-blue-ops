-- =============================================================
-- Seed Oceano Blue's actual product catalog
-- =============================================================
-- Pulled from the existing Fotello catalog. Adjust prices/durations
-- in the Supabase Table Editor as needed.
-- =============================================================

with new_products as (
  insert into products (slug, name, kind, short_description, long_description, base_price_cents, duration_minutes, is_addon, sort_order)
  values
    -- Core services
    ('interior_exterior_photo',
      'Interior/Exterior Photography', 'photo',
      'Professional HDR photos delivered next business day.',
      'Professional HDR interior & exterior photography for condos, townhomes, and smaller properties. Includes 25–35 fully edited, MLS-ready images delivered the next business day.',
      25000, 60, false, 10),

    ('cinematic_video',
      'Cinematic Videography', 'video',
      'Premium horizontal walkthrough.',
      'A horizontal HD video experience designed to tell the story of the property. This premium production highlights flow, lifestyle, and key features.',
      55000, 90, false, 20),

    ('social_reel',
      'Social Reel', 'video',
      'Vertical video for Instagram/TikTok.',
      'Vertical-format short reel optimized for social media. Perfect for Reels, TikTok, and Stories.',
      12500, 0, false, 30),

    ('floor_plan',
      'Floor Plan', 'floor_plan',
      '2D color floor plan.',
      'Accurate, color-coded 2D floor plan with room dimensions. MLS-ready.',
      9500, 30, false, 40),

    -- Add-ons
    ('drone_photography',
      'Drone Photography', 'addon',
      'Aerial stills to highlight lot, water, views.',
      'High-resolution aerial drone photography. Great for waterfront properties, large lots, and lifestyle context.',
      10000, 15, true, 50),

    ('drone_video',
      'Drone Video', 'addon',
      'Aerial cinematic b-roll.',
      'Aerial drone video footage edited into your walkthrough or as a standalone reel.',
      15000, 15, true, 60),

    ('same_day_delivery',
      'Same-Day Delivery', 'addon',
      'Get edited photos same evening.',
      'We deliver at lightning-fast speed without cutting corners, so you can move from shoot to market while the momentum is hottest.',
      10000, 0, true, 70),

    ('twilight',
      'Twilight Shoot', 'addon',
      'Golden-hour exterior session.',
      'Golden-hour exterior session that highlights warm interior lighting, dramatic skies, and architectural lines.',
      15000, 30, true, 80),

    ('virtual_tour',
      'Virtual Tour', 'addon',
      'Branded interactive tour.',
      'A branded, interactive web tour linking your photos and floor plan together.',
      12500, 0, true, 90),

    ('matterport_3d',
      'Matterport 3D Tour', 'addon',
      'Walkable 3D dollhouse.',
      'Walkable 3D Matterport scan of the entire home. Buyers can step inside online.',
      29500, 45, true, 100),

    ('three_d_floor_plan',
      '3D Home + Floor Plan', 'addon',
      '3D model with floor plan overlay.',
      '3D model of the home with a precise floor plan overlay. Includes both deliverables.',
      15000, 30, true, 110)
  returning id, slug
)
-- Sqft-bracketed pricing for the photo service (mirrors Fotello tiers).
insert into pricing_tiers (product_id, min_sqft, max_sqft, price_cents)
select id, null,   1500, 22500 from new_products where slug = 'interior_exterior_photo' union all
select id, 1501,   2500, 25000 from new_products where slug = 'interior_exterior_photo' union all
select id, 2501,   3500, 30000 from new_products where slug = 'interior_exterior_photo' union all
select id, 3501,   5000, 35000 from new_products where slug = 'interior_exterior_photo' union all
select id, 5001,   null, 45000 from new_products where slug = 'interior_exterior_photo';

-- Recommended add-ons per base product.
insert into product_recommended_addons (product_id, addon_id)
select base.id, addon.id
from products base, products addon
where base.slug = 'interior_exterior_photo'
  and addon.slug in ('drone_photography', 'same_day_delivery', 'three_d_floor_plan', 'twilight', 'virtual_tour');

insert into product_recommended_addons (product_id, addon_id)
select base.id, addon.id
from products base, products addon
where base.slug = 'cinematic_video'
  and addon.slug in ('drone_video', 'twilight', 'social_reel');
