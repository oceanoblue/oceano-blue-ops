-- =============================================================
-- Row Level Security
-- =============================================================
-- Policy: any authenticated team_member can read/write all rows.
-- Clients access only via signed delivery links (handled at API
-- layer using the service-role key, not via direct table access).
-- =============================================================

alter table team_members     enable row level security;
alter table clients          enable row level security;
alter table listings         enable row level security;
alter table orders           enable row level security;
alter table order_services   enable row level security;
alter table photos           enable row level security;
alter table ai_jobs          enable row level security;
alter table delivery_links   enable row level security;
alter table schedule_blocks  enable row level security;
alter table activity_log     enable row level security;

-- Helper: is this user a team_member?
create or replace function is_team_member()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from team_members
    where id = auth.uid() and is_active = true
  );
$$;

-- Team members: each user reads themselves; admins read all
create policy "team_members self select" on team_members
  for select using (auth.uid() = id or is_team_member());

create policy "team_members admin update" on team_members
  for update using (
    auth.uid() = id
    or exists (
      select 1 from team_members tm
      where tm.id = auth.uid() and tm.role = 'admin'
    )
  );

-- All other tables: team_member can do anything
create policy "team rw clients"        on clients         for all using (is_team_member()) with check (is_team_member());
create policy "team rw listings"       on listings        for all using (is_team_member()) with check (is_team_member());
create policy "team rw orders"         on orders          for all using (is_team_member()) with check (is_team_member());
create policy "team rw order_services" on order_services  for all using (is_team_member()) with check (is_team_member());
create policy "team rw photos"         on photos          for all using (is_team_member()) with check (is_team_member());
create policy "team rw ai_jobs"        on ai_jobs         for all using (is_team_member()) with check (is_team_member());
create policy "team rw delivery_links" on delivery_links  for all using (is_team_member()) with check (is_team_member());
create policy "team rw schedule_blocks"on schedule_blocks for all using (is_team_member()) with check (is_team_member());
create policy "team rw activity_log"   on activity_log    for all using (is_team_member()) with check (is_team_member());

-- Public booking: anyone can INSERT a draft order via API.
-- Implemented at API route layer with service-role key + validation,
-- not via direct anon access to the orders table.
