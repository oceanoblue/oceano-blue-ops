-- =============================================================
-- 0053 — Contractor photographer portal
-- =============================================================
-- A self-service portal for 1099 contractor photographers: they log their
-- own shoots (address, sqft, services), upload RAWs to Dropbox, and track
-- their history; the office sees per-contractor property counts + owed pay.
--
-- Security model — contractors are EXTERNAL, exactly like clients (0005):
--   * A `contractors` row binds to a Supabase auth user by email on first
--     magic-link login (link_contractor_account, mirrors link_client_account).
--   * Contractors are NOT team_members, so is_team_member() is false for them
--     and they get ZERO office access. They read only their own contractor row
--     and their own orders/listings via current_contractor_id()-scoped RLS.
--   * Every contractor MUTATION goes through a SECURITY DEFINER RPC that
--     re-derives the caller's contractor_id server-side; the client never
--     supplies its own contractor_id or a status/pay transition.
--
-- Pay model (owner decision 2026-07-17): FLAT RATE PER PROPERTY, set per
-- contractor (contractors.pay_rate_cents). Each shoot snapshots the rate in
-- effect (orders.pay_amount_cents) so later rate changes don't rewrite what's
-- already owed. Payout report + mark-paid is Phase 2; pay_status ships now.
-- =============================================================

-- 1. Contractors -------------------------------------------------------------
create table if not exists contractors (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  email citext not null unique,
  full_name text not null,
  phone text,
  -- Flat pay per completed property, in cents. Configurable per contractor;
  -- never hardcoded in app logic.
  pay_rate_cents int not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contractors_auth_user_idx on contractors(auth_user_id);
create trigger contractors_updated_at before update on contractors
  for each row execute procedure set_updated_at();

-- 2. Order columns for the contractor + pay side -----------------------------
alter table orders
  add column if not exists contractor_id uuid references contractors(id) on delete set null,
  -- 'office' = booked/assigned by staff · 'field' = contractor self-logged.
  add column if not exists source text not null default 'office',
  -- 'unpaid' | 'paid'. Payout report (Phase 2) drives the transition.
  add column if not exists pay_status text not null default 'unpaid',
  -- Snapshot of the contractor's flat rate at the moment the shoot became
  -- payable, so rate changes don't retroactively alter amounts owed.
  add column if not exists pay_amount_cents int not null default 0;

create index if not exists orders_contractor_idx on orders(contractor_id);
create index if not exists orders_pay_status_idx on orders(pay_status);

-- 3. Ownership helpers -------------------------------------------------------
create or replace function current_contractor_id()
returns uuid language sql stable security definer as $$
  select id from contractors where auth_user_id = auth.uid() and is_active = true limit 1;
$$;

-- Bind the just-authenticated user to the contractors row sharing their email.
-- Called by /field right after magic-link login. Idempotent.
create or replace function link_contractor_account()
returns contractors language plpgsql security definer
set search_path = public as $$
declare
  v_email text;
  v_row contractors;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'not_authenticated';
  end if;

  update contractors
     set auth_user_id = auth.uid()
   where email = v_email and (auth_user_id is null or auth_user_id = auth.uid())
   returning * into v_row;

  return v_row;  -- null row if this email isn't a registered contractor
end;
$$;

-- 4. Row-level security ------------------------------------------------------
alter table contractors enable row level security;

-- Team: full access to the roster (add contractors, set rates, mark paid).
create policy "team all contractors" on contractors
  for all using (is_team_member()) with check (is_team_member());

-- Contractor: read only their own row.
create policy "contractor read own row" on contractors
  for select using (auth_user_id = auth.uid());

-- Contractor: read their own orders (assigned or self-logged). Team keeps the
-- existing all-access policy from 0002.
create policy "contractor read own orders" on orders
  for select using (contractor_id = current_contractor_id());

-- Contractor: read listings attached to their own orders (for the address on
-- the "my shoots" list and the shoot detail).
create policy "contractor read own listings" on listings
  for select using (
    exists (
      select 1 from orders o
      where o.listing_id = listings.id
        and o.contractor_id = current_contractor_id()
    )
  );

-- 5. Field-intake placeholder client -----------------------------------------
-- orders.client_id / listings.client_id are NOT NULL. A field shoot has no
-- billing client yet, so it attaches to one shared "Field Intake" client until
-- the office reconciles the real agent. (Same trick as 0046's placeholder
-- listing.) get-or-create, callable only inside the definer RPCs below.
create or replace function field_intake_client_id()
returns uuid language plpgsql security definer
set search_path = public as $$
declare
  v_client uuid;
begin
  select id into v_client from clients where email = 'field-intake@oceanoblue.internal' limit 1;
  if v_client is null then
    insert into clients (email, full_name, notes)
    values ('field-intake@oceanoblue.internal', 'Field Intake (unassigned)',
            'Placeholder for contractor-logged shoots awaiting client assignment.')
    returning id into v_client;
  end if;
  return v_client;
end;
$$;

-- 6. Contractor mutation RPCs (SECURITY DEFINER, ownership re-derived) --------

-- Log a new field shoot: creates the listing + order for the current
-- contractor, snapshots their flat rate, returns the new order id.
create or replace function create_field_shoot(
  p_address_line1 text,
  p_city          text,
  p_state         text,
  p_zip           text,
  p_address_line2 text default null,
  p_property_type text default null,
  p_bedrooms      int  default null,
  p_bathrooms     numeric default null,
  p_sqft          int  default null,
  p_lat           double precision default null,
  p_lng           double precision default null,
  p_access_notes  text default null,
  p_services      jsonb default '[]'::jsonb,
  p_notes         text default null
) returns uuid language plpgsql security definer
set search_path = public as $$
declare
  v_contractor uuid := current_contractor_id();
  v_rate       int;
  v_client     uuid;
  v_listing    uuid;
  v_order      uuid;
begin
  if v_contractor is null then
    raise exception 'not_a_contractor';
  end if;
  if coalesce(nullif(trim(p_address_line1), ''), '') = '' then
    raise exception 'address_required';
  end if;

  select pay_rate_cents into v_rate from contractors where id = v_contractor;
  v_client := field_intake_client_id();

  insert into listings (
    client_id, address_line1, address_line2, city, state, zip,
    lat, lng, property_type, bedrooms, bathrooms, sqft, access_notes, status
  ) values (
    v_client, p_address_line1, nullif(p_address_line2,''), p_city, p_state, p_zip,
    p_lat, p_lng, nullif(p_property_type,''), p_bedrooms, p_bathrooms, p_sqft,
    nullif(p_access_notes,''), 'active'
  ) returning id into v_listing;

  insert into orders (
    listing_id, client_id, contractor_id, source, status,
    pay_amount_cents, internal_notes
  ) values (
    v_listing, v_client, v_contractor, 'field', 'shooting',
    coalesce(v_rate, 0),
    case when coalesce(jsonb_array_length(p_services),0) > 0
         then 'Field services: ' || (select string_agg(t.v, ', ') from jsonb_array_elements_text(p_services) as t(v))
         else null end
  ) returning id into v_order;

  return v_order;
end;
$$;

-- Mark a contractor's own field shoot as uploaded (RAWs are in Dropbox).
create or replace function mark_field_shoot_uploaded(p_order_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_contractor uuid := current_contractor_id();
begin
  if v_contractor is null then
    raise exception 'not_a_contractor';
  end if;

  update orders
     set status = 'uploaded', updated_at = now()
   where id = p_order_id
     and contractor_id = v_contractor
     and status in ('shooting', 'scheduled', 'booked');

  if not found then
    raise exception 'order_not_updatable';
  end if;
end;
$$;

-- 7. Grants ------------------------------------------------------------------
revoke all on function create_field_shoot(text,text,text,text,text,text,int,numeric,int,double precision,double precision,text,jsonb,text) from public, anon;
revoke all on function mark_field_shoot_uploaded(uuid) from public, anon;
revoke all on function field_intake_client_id() from public, anon;
grant execute on function current_contractor_id() to authenticated;
grant execute on function link_contractor_account() to authenticated;
grant execute on function create_field_shoot(text,text,text,text,text,text,int,numeric,int,double precision,double precision,text,jsonb,text) to authenticated;
grant execute on function mark_field_shoot_uploaded(uuid) to authenticated;
