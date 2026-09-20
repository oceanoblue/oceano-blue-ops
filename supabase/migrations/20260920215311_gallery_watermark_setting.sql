-- One business-wide preference; existing team-write RLS governs the switch.
alter table public.business_settings
  add column gallery_watermark_enabled boolean not null default false;
comment on column public.business_settings.gallery_watermark_enabled is
  'Overlay the Oceano Blue watermark on unpaid gallery previews. Downloads remain payment-gated in either mode.';
