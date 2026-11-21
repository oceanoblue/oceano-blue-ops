-- Provider credentials are server-only. A public profile URL never certifies access.
create table public.social_channel_connections (
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram')),
  remote_id text not null check (remote_id ~ '^[0-9]+$'),
  label text not null, encrypted_page_token text not null check (encrypted_page_token like 'gcm1:%'),
  connected_by uuid references public.team_members(id), verified_at timestamptz not null default now(),
  primary key(account_id, platform), unique(platform, remote_id)
);
alter table public.social_channel_connections enable row level security;
revoke all on public.social_channel_connections from public, anon, authenticated;
grant select, insert, update, delete on public.social_channel_connections to service_role;

alter table public.social_programs add column reporting_mode text not null default 'progress'
  check(reporting_mode in ('progress','client_managed','agency_report'));
create table public.social_monthly_results (
  program_id uuid not null references public.social_programs(id) on delete cascade,
  month date not null check (extract(day from month)=1),
  report_url text not null check (report_url ~ '^https://'),
  source text not null check(length(source) between 1 and 100),
  updated_at timestamptz not null default now(), primary key(program_id,month)
);
alter table public.social_monthly_results enable row level security;
revoke all on public.social_monthly_results from public,anon,authenticated;
grant select,insert,update,delete on public.social_monthly_results to service_role;
