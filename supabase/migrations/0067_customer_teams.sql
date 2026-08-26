-- Customer teams: a realtor client can belong to a team of full client accounts
-- (lead agent + coordinator + 2nd agent) who share the team's listings,
-- galleries, delivery notifications, and can order on the team's behalf.
-- Access is a membership graph — no team_id on listings/orders; a client sees
-- everything belonging to any client they share a team with.

create table if not exists public.client_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brokerage text,
  notes text,
  created_by uuid references public.team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.client_teams(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  role text not null default 'member',            -- 'admin' | 'member'
  notify_on_delivery boolean not null default true,
  created_at timestamptz not null default now(),
  unique (team_id, client_id)
);
create index if not exists client_team_members_client_idx on public.client_team_members(client_id);
create index if not exists client_team_members_team_idx on public.client_team_members(team_id);

-- Team-aware identity: the caller's own client id plus every client that shares
-- a team with them. SECURITY DEFINER so it bypasses RLS on the team tables.
create or replace function public.current_client_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  with me as (select id from clients where auth_user_id = auth.uid())
  select id from me
  union
  select ctm2.client_id
  from client_team_members ctm1
  join client_team_members ctm2 on ctm2.team_id = ctm1.team_id
  where ctm1.client_id in (select id from me);
$$;
grant execute on function public.current_client_ids() to authenticated;

-- Team tables RLS: staff manage; clients read teams they belong to.
alter table public.client_teams enable row level security;
alter table public.client_team_members enable row level security;

create policy "staff all client_teams" on public.client_teams
  for all to authenticated using (is_team_member()) with check (is_team_member());
create policy "staff all client_team_members" on public.client_team_members
  for all to authenticated using (is_team_member()) with check (is_team_member());

create policy "client read own teams" on public.client_teams for select to authenticated
  using (id in (select ctm.team_id from client_team_members ctm join clients c on c.id = ctm.client_id where c.auth_user_id = auth.uid()));
create policy "client read own team members" on public.client_team_members for select to authenticated
  using (team_id in (select ctm.team_id from client_team_members ctm join clients c on c.id = ctm.client_id where c.auth_user_id = auth.uid()));

-- Broaden every client read policy from a single client to the membership graph.
alter policy "client read own listings" on public.listings
  using (client_id in (select current_client_ids()));
alter policy "client read own orders" on public.orders
  using (client_id in (select current_client_ids()));
alter policy "client read own order_services" on public.order_services
  using (exists (select 1 from orders o where o.id = order_services.order_id and o.client_id in (select current_client_ids())));
alter policy "client read own delivered photos" on public.photos
  using (exists (select 1 from orders o where o.id = photos.order_id and o.client_id in (select current_client_ids()) and photos.kind = any (array['processed'::photo_kind,'delivered'::photo_kind]) and photos.is_selected = true));
alter policy "client read own published deliverables" on public.listing_deliverables
  using ((is_published = true) and exists (select 1 from listings l where l.id = listing_deliverables.listing_id and l.client_id in (select current_client_ids())));
alter policy "client read own edit_jobs" on public.edit_jobs
  using (exists (select 1 from orders o where o.id = edit_jobs.order_id and o.client_id in (select current_client_ids())));
alter policy "client read own reel_briefs" on public.reel_briefs
  using (exists (select 1 from orders o where o.id = reel_briefs.order_id and o.client_id in (select current_client_ids())));
alter policy "client read own order_footage" on public.order_footage
  using (client_id in (select current_client_ids()));

-- Storage reads (downloads) follow the same graph.
alter policy "client read own delivery files" on storage.objects
  using ((bucket_id = any (array['delivery'::text,'processed-photos'::text])) and exists (select 1 from photos p join orders o on o.id = p.order_id where p.storage_path = objects.name and p.bucket = objects.bucket_id and o.client_id in (select current_client_ids()) and p.is_selected = true and p.kind = any (array['processed'::photo_kind,'delivered'::photo_kind])));
alter policy "client read own renders" on storage.objects
  using ((bucket_id = 'reel-renders'::text) and exists (select 1 from orders o where o.id::text = split_part(objects.name,'/'::text,1) and o.client_id in (select current_client_ids())));
alter policy "client read own footage" on storage.objects
  using ((bucket_id = 'client-footage'::text) and split_part(name,'/'::text,1) in (select cid::text from current_client_ids() cid));
