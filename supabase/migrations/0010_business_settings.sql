-- =============================================================
-- Org-wide booking settings (singleton row)
-- =============================================================
-- Drives buffer time between shoots, min/max notice for bookings,
-- and the default timezone shown to clients.
-- =============================================================

create table business_settings (
  id boolean primary key default true,           -- enforce single row
  buffer_minutes int not null default 30,
  min_notice_hours int not null default 4,
  max_notice_days int not null default 30,
  default_timezone text not null default 'America/New_York',
  business_name text not null default 'Oceano Blue',
  updated_at timestamptz not null default now(),
  constraint single_row check (id = true)
);

alter table business_settings enable row level security;

-- Everyone can read settings (used by /api/availability for anon clients).
create policy "public read business_settings"
  on business_settings for select using (true);

-- Only team can update.
create policy "team write business_settings"
  on business_settings for all using (is_team_member()) with check (is_team_member());

create trigger business_settings_updated_at
  before update on business_settings
  for each row execute procedure set_updated_at();

-- Seed defaults
insert into business_settings (id) values (true) on conflict do nothing;
