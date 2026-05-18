-- =============================================================
-- Per-photographer availability + calendar connections
-- =============================================================
-- Adds:
--   1. team_availability      — weekly recurring working hours per photographer
--   2. team_calendar_connections — OAuth refresh tokens for Google Calendar (Push 2)
--   3. Helper function next_available_photographer_id() used by /api/availability
-- =============================================================

create table team_availability (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references team_members(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),  -- 0=Sun
  start_local time not null,                                       -- e.g. 09:00
  end_local time not null,                                         -- e.g. 17:00
  timezone text not null default 'America/New_York',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_member_id, day_of_week)
);

create index team_availability_member_idx on team_availability(team_member_id);

alter table team_availability enable row level security;

create policy "team rw availability"
  on team_availability for all
  using (is_team_member())
  with check (is_team_member());

-- Anon API needs to READ availability to compute slots for the booking wizard
-- (the api route uses service-role anyway, but a permissive read is fine since
-- this is just working-hour metadata, no PII).
create policy "public read availability"
  on team_availability for select
  using (is_active = true);

create trigger team_availability_updated_at
  before update on team_availability
  for each row execute procedure set_updated_at();

-- -----------------------------------------------------------------
-- Calendar connections (Push 2 will populate this)
-- -----------------------------------------------------------------
create table team_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references team_members(id) on delete cascade,
  provider text not null check (provider in ('google')),
  account_email text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  primary_calendar_id text,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_member_id, provider)
);

create index team_calendar_connections_member_idx on team_calendar_connections(team_member_id);

alter table team_calendar_connections enable row level security;

-- ONLY the team member themselves (or admin) can see their tokens.
create policy "self read calendar connection"
  on team_calendar_connections for select using (
    team_member_id = auth.uid()
    or exists (select 1 from team_members tm where tm.id = auth.uid() and tm.role = 'admin')
  );

create policy "self rw calendar connection"
  on team_calendar_connections for all
  using (team_member_id = auth.uid() or exists (select 1 from team_members tm where tm.id = auth.uid() and tm.role = 'admin'))
  with check (team_member_id = auth.uid() or exists (select 1 from team_members tm where tm.id = auth.uid() and tm.role = 'admin'));

create trigger team_calendar_connections_updated_at
  before update on team_calendar_connections
  for each row execute procedure set_updated_at();

-- -----------------------------------------------------------------
-- Seed: give every existing photographer / admin Mon-Fri 9-5 ET
-- so the booking flow has slots out of the box.
-- -----------------------------------------------------------------
insert into team_availability (team_member_id, day_of_week, start_local, end_local, timezone)
select tm.id, dow, '09:00'::time, '17:00'::time, 'America/New_York'
from team_members tm
cross join generate_series(1, 5) as dow
where tm.is_active = true
  and tm.role in ('admin', 'photographer', 'coordinator')
on conflict do nothing;
