-- Calendars shared with an Ops-connected account can belong to another crew member.
-- Explicit ownership keeps that person's busy time out of the viewer's slots.
create table public.team_shared_calendar_assignments (
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  viewer_team_member_id uuid not null references public.team_members(id) on delete cascade,
  calendar_id text not null,
  created_at timestamptz not null default now(),
  primary key (viewer_team_member_id, calendar_id),
  constraint separate_calendar_owner check (team_member_id <> viewer_team_member_id)
);
create index team_shared_calendar_assignments_member_idx
  on public.team_shared_calendar_assignments(team_member_id);
alter table public.team_shared_calendar_assignments enable row level security;
revoke all on public.team_shared_calendar_assignments from public, anon, authenticated;
grant select, insert, update, delete on public.team_shared_calendar_assignments to service_role;
