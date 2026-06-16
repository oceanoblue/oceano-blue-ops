-- 0041_enhance_grade_columns.sql
-- Make the enhance settings panel actually drive the live grade. The pipeline's
-- LUXURY_BASELINE uses the modern Lightroom-style knobs (exposure, contrast,
-- temp/tint, saturation, highlights/shadows/whites/blacks, sharpening), but the
-- settings table only stored the legacy 3 (shadow_lift/highlight_recover/
-- vibrance) — which the baseline overrides, so tuning the panel did nothing.
--
-- Add the full grade as columns (defaulted to the current LUXURY_BASELINE) so
-- saved values flow through loadEnhanceSettings and override the baseline.

alter table public.oceano_enhance_settings
  add column if not exists exposure   numeric not null default 0.25,
  add column if not exists contrast   numeric not null default 0.08,
  add column if not exists temp       numeric not null default 0.0,
  add column if not exists tint       numeric not null default 0.0,
  add column if not exists saturation numeric not null default 0.10,
  add column if not exists highlights numeric not null default 0.35,
  add column if not exists shadows    numeric not null default 0.30,
  add column if not exists whites     numeric not null default 0.0,
  add column if not exists blacks     numeric not null default -0.03,
  add column if not exists sharpening numeric not null default 0.30;
