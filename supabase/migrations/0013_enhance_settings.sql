-- Oceano Enhance pipeline knobs. Single-row table (id = true) so we can
-- always upsert without needing to look up an id. Same pattern as
-- business_settings.

create table if not exists oceano_enhance_settings (
  id boolean primary key default true,
  target_long_edge int not null default 3000,
  shadow_lift numeric(3,2) not null default 0.35,
  highlight_recover numeric(3,2) not null default 0.40,
  vibrance numeric(3,2) not null default 0.15,
  jpeg_quality int not null default 92,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = true)
);

insert into oceano_enhance_settings (id) values (true) on conflict (id) do nothing;

alter table oceano_enhance_settings enable row level security;

create policy "team read enhance settings" on oceano_enhance_settings
  for select using (is_team_member());
create policy "team write enhance settings" on oceano_enhance_settings
  for all using (is_team_member()) with check (is_team_member());
