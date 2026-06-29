-- =============================================================
-- 0049 — Photo project type (production profile)
-- =============================================================
-- Different photo markets want different finishes from the SAME capture gear:
--   - mls_real_estate    : fast, bright, clean, consistent (current default look)
--   - luxury_real_estate : elevated marketing finish
--   - architectural      : technically accurate, sober, documentary — NOT HDR-pushed
--   - interior_design    : faithful colour & texture, editorial
--
-- This is the FIRST decision on a shoot order. It selects a production profile
-- (grade style, enabled ops, QC ruleset, delivery presets) — one parameterized
-- pipeline, not four forks. Phase A wires the grade style; the rest follows.
-- Existing orders default to mls_real_estate (unchanged behaviour).
-- =============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_type') then
    create type project_type as enum (
      'mls_real_estate', 'luxury_real_estate', 'architectural', 'interior_design'
    );
  end if;
end$$;

alter table public.orders
  add column if not exists project_type project_type not null default 'mls_real_estate';

comment on column public.orders.project_type is
  'Photo production profile selected at order creation; drives grade style, '
  'enabled ops, QC ruleset and delivery presets. See lib/photos/profiles.ts.';
