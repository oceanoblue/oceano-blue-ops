-- =============================================================
-- 0076 — Recommended add-ons for the architectural packages
-- =============================================================
-- The booking wizard only pops the "add-ons" window when a base package has
-- recommended add-ons linked (ProductsStep: recommended_addon_ids). The 0075
-- architectural packages had none, so the window never appeared. Link each
-- package to its relevant add-ons.
-- =============================================================

insert into product_recommended_addons (product_id, addon_id)
select base.id, addon.id
from products base
join products addon on true
where (base.slug, addon.slug) in (
  -- Photo package upsells
  ('arch_photo', 'arch_twilight'),
  ('arch_photo', 'arch_360_tour'),
  ('arch_photo', 'arch_floor_plan'),
  ('arch_photo', 'arch_virtual_staging'),
  ('arch_photo', 'arch_rush'),
  ('arch_photo', 'arch_weekend'),
  -- Video package upsells
  ('arch_video', 'arch_drone_video'),
  ('arch_video', 'arch_social_cut'),
  ('arch_video', 'arch_rush'),
  ('arch_video', 'arch_weekend')
)
and not exists (
  select 1 from product_recommended_addons r
  where r.product_id = base.id and r.addon_id = addon.id
);
