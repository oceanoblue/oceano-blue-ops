-- Additive; old tonal settings and historical recipes remain intact.
alter table public.oceano_enhance_settings
  add column if not exists finish_defaults jsonb not null default '{"auto":{"style":"bright_listing","scene":"auto","windows":"strong","quality":"high"},"interior":{"style":"bright_listing","scene":"interior","windows":"strong","quality":"high"},"exterior":{"style":"bright_listing","scene":"exterior","windows":"balanced","quality":"high"}}'::jsonb;
