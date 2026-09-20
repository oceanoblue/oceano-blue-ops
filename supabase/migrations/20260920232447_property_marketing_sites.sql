create table public.property_sites (
  order_id uuid primary key references public.orders(id) on delete cascade,
  slug uuid not null default gen_random_uuid() unique,
  headline text not null check(length(btrim(headline)) between 1 and 160),
  description text not null default '' check(length(description)<=5000),
  agent_name text not null default '' check(length(agent_name)<=120),
  agent_phone text not null default '' check(length(agent_phone)<=40),
  agent_email text not null default '' check(length(agent_email)<=254),
  asking_price_cents bigint check(asking_price_cents between 0 and 100000000000),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.property_sites enable row level security;
revoke all on public.property_sites from public,anon,authenticated;
grant select,insert,update on public.property_sites to authenticated;
grant all on public.property_sites to service_role;
create policy "staff manage property sites" on public.property_sites for all to authenticated using(public.is_team_member()) with check(public.is_team_member());
create trigger property_sites_updated_at before update on public.property_sites for each row execute function public.set_updated_at();
