-- =============================================================
-- 0046 — Reel editing orders: client footage intake + brief
-- =============================================================
-- Adds a new ORDER KIND ("reel_edit") for footage-in video edits, the
-- client-supplied BRIEF, uploaded FOOTAGE rows, and the FIRST EVER
-- client-writable storage bucket (client-footage) — with strict per-client
-- path isolation. Everything is additive; existing shoot orders are unchanged.
--
-- Security model (this is the first surface clients can WRITE to):
--   * RLS on every new table. Clients touch only rows for their own orders.
--   * All client MUTATIONS go through SECURITY DEFINER RPCs that re-derive the
--     caller's client_id server-side via current_client_id(); the client never
--     supplies its own client_id, order ownership, or status transition.
--   * The footage bucket is private, video-MIME + size limited, and a client
--     can only read/write/delete objects under their own  <client_id>/...
--     path prefix. Team members retain full access.
-- =============================================================

-- 1. Order-kind discriminator ------------------------------------------------
do $$ begin
  create type order_kind as enum ('shoot', 'reel_edit');
exception when duplicate_object then null; end $$;

alter table orders
  add column if not exists order_kind order_kind not null default 'shoot';

-- 2. Reel type --------------------------------------------------------------
do $$ begin
  create type reel_type as enum ('monologue', 'qa', 'testimonial', 'montage');
exception when duplicate_object then null; end $$;

-- 3. Brief (one per reel order) ---------------------------------------------
create table if not exists reel_briefs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  reel_type reel_type not null default 'monologue',
  aspect text not null default '1080x1920',
  length_target_s int,
  captions boolean not null default true,
  music boolean not null default false,
  lower_third boolean not null default true,
  subject_name text,
  subject_title text,
  brand_kit jsonb not null default '{}'::jsonb,    -- logo / colors / fonts
  must_include text,
  must_avoid text,
  brief jsonb not null default '{}'::jsonb,          -- full canonical brief (§8b)
  edit_instructions jsonb,                           -- team DSL (§8c, phase-2 input)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reel_briefs_order_idx on reel_briefs(order_id);
create trigger reel_briefs_updated_at before update on reel_briefs
  for each row execute procedure set_updated_at();

-- 4. Uploaded footage clips -------------------------------------------------
create table if not exists order_footage (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  bucket text not null default 'client-footage',
  storage_path text not null,
  filename text not null,
  mime_type text,
  byte_size bigint,
  duration_seconds numeric,
  width int,
  height int,
  role text,            -- monologue / qa / b-roll / etc.
  notes text,
  created_at timestamptz not null default now(),
  unique (bucket, storage_path)
);
create index if not exists order_footage_order_idx on order_footage(order_id);
create index if not exists order_footage_client_idx on order_footage(client_id);

-- 5. Row-level security -----------------------------------------------------
alter table reel_briefs enable row level security;
alter table order_footage enable row level security;

-- Team: full access.
create policy "team all reel_briefs" on reel_briefs
  for all using (is_team_member()) with check (is_team_member());
create policy "team all order_footage" on order_footage
  for all using (is_team_member()) with check (is_team_member());

-- Client: read-only on their own rows. All writes go through the RPCs below.
create policy "client read own reel_briefs" on reel_briefs
  for select using (
    exists (
      select 1 from orders o
      where o.id = reel_briefs.order_id and o.client_id = current_client_id()
    )
  );
create policy "client read own order_footage" on order_footage
  for select using (client_id = current_client_id());

-- 6. Client-writable footage bucket ----------------------------------------
-- 2 GB/file cap; explicit video MIMEs only (no octet-stream wildcard) to keep
-- the one client-writable surface tight.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-footage', 'client-footage', false, 2147483648,
  array['video/mp4','video/quicktime','video/x-m4v','video/hevc','video/mpeg','video/webm']
)
on conflict (id) do nothing;

-- A client may only touch objects whose FIRST path segment equals their own
-- client_id:  <client_id>/<order_id>/<filename>. current_client_id() is null
-- for team/anon, so these comparisons fail closed for non-clients.
create policy "client read own footage"
  on storage.objects for select
  using (bucket_id = 'client-footage'
         and split_part(name, '/', 1) = current_client_id()::text);

create policy "client write own footage"
  on storage.objects for insert
  with check (bucket_id = 'client-footage'
              and current_client_id() is not null
              and split_part(name, '/', 1) = current_client_id()::text);

create policy "client update own footage"
  on storage.objects for update
  using (bucket_id = 'client-footage'
         and split_part(name, '/', 1) = current_client_id()::text)
  with check (bucket_id = 'client-footage'
              and split_part(name, '/', 1) = current_client_id()::text);

create policy "client delete own footage"
  on storage.objects for delete
  using (bucket_id = 'client-footage'
         and split_part(name, '/', 1) = current_client_id()::text);

create policy "team all footage"
  on storage.objects for all
  using (bucket_id = 'client-footage' and is_team_member())
  with check (bucket_id = 'client-footage' and is_team_member());

-- 7. Client mutation RPCs (SECURITY DEFINER, ownership re-derived) ----------

-- Create a reel order + brief for the current client. Returns the order id.
-- Attaches to a per-client "Brand Content" listing (created once) so the
-- orders.listing_id NOT NULL constraint holds without requiring a property.
create or replace function create_reel_order(p_brief jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer
set search_path = public as $$
declare
  v_client  uuid := current_client_id();
  v_listing uuid;
  v_order   uuid;
begin
  if v_client is null then
    raise exception 'not_a_client';
  end if;

  select id into v_listing
    from listings
   where client_id = v_client and address_line1 = 'Brand Content'
   order by created_at
   limit 1;

  if v_listing is null then
    insert into listings (client_id, address_line1, city, state, zip, status)
    values (v_client, 'Brand Content', '—', '—', '—', 'draft')
    returning id into v_listing;
  end if;

  insert into orders (listing_id, client_id, status, order_kind)
  values (v_listing, v_client, 'draft', 'reel_edit')
  returning id into v_order;

  insert into reel_briefs (
    order_id, reel_type, aspect, length_target_s,
    captions, music, lower_third, subject_name, subject_title,
    brand_kit, must_include, must_avoid, brief
  ) values (
    v_order,
    coalesce(nullif(p_brief->>'reel_type','')::reel_type, 'monologue'),
    coalesce(nullif(p_brief->>'aspect',''), '1080x1920'),
    nullif(p_brief->>'length_target_s','')::int,
    coalesce((p_brief->>'captions')::boolean, true),
    coalesce((p_brief->>'music')::boolean, false),
    coalesce((p_brief->>'lower_third')::boolean, true),
    nullif(p_brief->>'subject_name',''),
    nullif(p_brief->>'subject_title',''),
    coalesce(p_brief->'brand_kit', '{}'::jsonb),
    nullif(p_brief->>'must_include',''),
    nullif(p_brief->>'must_avoid',''),
    coalesce(p_brief, '{}'::jsonb)
  );

  return v_order;
end;
$$;

-- Register an uploaded footage clip against a draft reel order the caller owns.
create or replace function add_reel_footage(
  p_order_id        uuid,
  p_storage_path    text,
  p_filename        text,
  p_mime_type       text    default null,
  p_byte_size       bigint  default null,
  p_duration_seconds numeric default null,
  p_width           int     default null,
  p_height          int     default null,
  p_role            text    default null,
  p_notes           text    default null
) returns uuid language plpgsql security definer
set search_path = public as $$
declare
  v_client  uuid := current_client_id();
  v_footage uuid;
begin
  if v_client is null then
    raise exception 'not_a_client';
  end if;

  if not exists (
    select 1 from orders o
    where o.id = p_order_id
      and o.client_id = v_client
      and o.order_kind = 'reel_edit'
      and o.status = 'draft'
  ) then
    raise exception 'order_not_editable';
  end if;

  -- Defence in depth: the registered path must live under the caller's prefix
  -- (storage RLS already enforces this on the upload itself).
  if split_part(p_storage_path, '/', 1) <> v_client::text then
    raise exception 'path_outside_client_prefix';
  end if;

  insert into order_footage (
    order_id, client_id, bucket, storage_path, filename, mime_type,
    byte_size, duration_seconds, width, height, role, notes
  ) values (
    p_order_id, v_client, 'client-footage', p_storage_path, p_filename, p_mime_type,
    p_byte_size, p_duration_seconds, p_width, p_height, p_role, p_notes
  )
  returning id into v_footage;

  return v_footage;
end;
$$;

-- Submit a completed draft reel order for the team to pick up.
create or replace function submit_reel_order(p_order_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_client uuid := current_client_id();
begin
  if v_client is null then
    raise exception 'not_a_client';
  end if;

  update orders
     set status = 'booked', updated_at = now()
   where id = p_order_id
     and client_id = v_client
     and order_kind = 'reel_edit'
     and status = 'draft';

  if not found then
    raise exception 'order_not_submittable';
  end if;
end;
$$;

revoke all on function create_reel_order(jsonb) from public, anon;
revoke all on function add_reel_footage(uuid, text, text, text, bigint, numeric, int, int, text, text) from public, anon;
revoke all on function submit_reel_order(uuid) from public, anon;
grant execute on function create_reel_order(jsonb) to authenticated;
grant execute on function add_reel_footage(uuid, text, text, text, bigint, numeric, int, int, text, text) to authenticated;
grant execute on function submit_reel_order(uuid) to authenticated;
