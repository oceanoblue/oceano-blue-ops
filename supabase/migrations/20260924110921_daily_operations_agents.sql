-- Personal briefings contain private calendar details. Only their owner may
-- read them; only the server runner may write results or claim execution slots.
create table public.ops_agent_settings (
  user_id uuid primary key references public.team_members(id) on delete cascade,
  enabled boolean not null default true,
  timezone text not null default 'America/New_York',
  brief_time text not null default '07:00' check (brief_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  agents jsonb not null default '{"planner":{"provider":"rules","model":""},"handoff":{"provider":"rules","model":""},"delivery":{"provider":"rules","model":""}}',
  updated_at timestamptz not null default now()
);
create table public.ops_brief_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.team_members(id) on delete cascade,
  local_date date not null,
  run_key text not null,
  status text not null default 'running' check (status in ('running','completed','partial','failed')),
  snapshot jsonb,
  outputs jsonb not null default '[]',
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id,local_date,run_key)
);
create index ops_brief_runs_history on public.ops_brief_runs(user_id,created_at desc);
alter table public.ops_agent_settings enable row level security;
alter table public.ops_brief_runs enable row level security;
revoke all on public.ops_agent_settings, public.ops_brief_runs from anon, authenticated;
grant select,insert,update on public.ops_agent_settings to authenticated;
grant select on public.ops_brief_runs to authenticated;
grant all on public.ops_agent_settings, public.ops_brief_runs to service_role;
create policy "own staff settings" on public.ops_agent_settings for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_team_member()))
  with check (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy "own staff briefings" on public.ops_brief_runs for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_team_member()));
-- Existing office users receive a daily factual briefing, with no paid calls.
insert into public.ops_agent_settings(user_id)
select id from public.team_members where is_active and role <> 'photographer'
on conflict do nothing;
