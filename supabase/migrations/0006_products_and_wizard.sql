-- =============================================================
-- Products, pricing tiers, and a richer booking RPC
-- =============================================================
-- Adds:
--   1. products        — services + add-ons agents can buy
--   2. pricing_tiers   — sqft-based price brackets per product
--   3. recommended_addons junction (M:N) for upsells
--   4. listings.access_notes already exists; add highlights/timezone
--   5. orders.timezone column
--   6. create_booking_v2() RPC for the 5-step wizard
-- =============================================================

-- Make sure pgcrypto is loaded for gen_random_uuid (idempotent).
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------
-- PRODUCTS
-- A row per service or add-on the agent can pick.
-- -----------------------------------------------------------------
create type product_kind as enum ('photo', 'video', 'floor_plan', 'tour', 'fee', 'addon');

create table products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind product_kind not null,
  short_description text,
  long_description text,
  cover_image_url text,
  is_addon boolean not null default false,
  is_active boolean not null default true,
  base_price_cents int not null default 0,
  duration_minutes int not null default 0,    -- contributes to total shoot duration
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_active_idx on products(is_active) where is_active = true;

-- Sqft-bracketed prices (NULL min/max = open ended).
create table pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  min_sqft int,
  max_sqft int,
  price_cents int not null,
  created_at timestamptz not null default now()
);

create index pricing_tiers_product_idx on pricing_tiers(product_id);

-- M:N recommended-addons per base product.
create table product_recommended_addons (
  product_id uuid not null references products(id) on delete cascade,
  addon_id   uuid not null references products(id) on delete cascade,
  primary key (product_id, addon_id)
);

-- -----------------------------------------------------------------
-- Listing + order field additions
-- -----------------------------------------------------------------
alter table listings
  add column if not exists access_method text,        -- "lockbox 1234", "agent on site"
  add column if not exists highlights text;            -- "outdoor kitchen, ocean view"

alter table orders
  add column if not exists timezone text default 'America/New_York';

-- -----------------------------------------------------------------
-- order_items — replaces order_services for richer line-item info
-- (we keep order_services around for back-compat with v1 bookings).
-- -----------------------------------------------------------------
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  description text not null,
  quantity int not null default 1,
  unit_price_cents int not null,
  total_cents int not null,
  duration_minutes int not null default 0,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on order_items(order_id);

-- -----------------------------------------------------------------
-- Compute price for product at given sqft
-- -----------------------------------------------------------------
create or replace function price_for_sqft(p_product_id uuid, p_sqft int)
returns int language sql stable as $$
  select coalesce(
    (select price_cents from pricing_tiers
     where product_id = p_product_id
       and (min_sqft is null or p_sqft >= min_sqft)
       and (max_sqft is null or p_sqft <= max_sqft)
     order by min_sqft desc nulls last
     limit 1),
    (select base_price_cents from products where id = p_product_id),
    0
  );
$$;

-- -----------------------------------------------------------------
-- Booking v2 RPC — atomic create for the wizard.
-- Inputs are JSON to keep the call sites tidy.
-- -----------------------------------------------------------------
create or replace function create_booking_v2(
  p_client_email text,
  p_client_name  text,
  p_client_phone text,
  p_client_brokerage text,

  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_state text,
  p_zip text,
  p_lat double precision,
  p_lng double precision,
  p_sqft int,

  p_scheduled_at timestamptz,
  p_duration_minutes int,
  p_timezone text,
  p_access_method text,
  p_highlights text,

  -- array of objects: { product_id uuid, quantity int }
  p_items jsonb
) returns uuid
language plpgsql security definer as $$
declare
  v_client_id  uuid;
  v_listing_id uuid;
  v_order_id   uuid;
  v_item       jsonb;
  v_price      int;
  v_total      int := 0;
  v_duration   int := 0;
begin
  -- 1. upsert client
  insert into clients (email, full_name, phone, brokerage)
  values (p_client_email, p_client_name, nullif(p_client_phone, ''), nullif(p_client_brokerage, ''))
  on conflict (email) do update
    set full_name = excluded.full_name,
        phone     = coalesce(excluded.phone, clients.phone),
        brokerage = coalesce(excluded.brokerage, clients.brokerage)
  returning id into v_client_id;

  -- 2. listing
  insert into listings (
    client_id, address_line1, address_line2, city, state, zip,
    lat, lng, sqft, access_method, highlights, status
  ) values (
    v_client_id, p_address_line1, nullif(p_address_line2, ''), p_city, p_state, p_zip,
    p_lat, p_lng, p_sqft, p_access_method, p_highlights, 'draft'
  ) returning id into v_listing_id;

  -- 3. order shell
  insert into orders (
    listing_id, client_id, status, scheduled_at, duration_minutes,
    timezone, client_notes
  ) values (
    v_listing_id, v_client_id, 'booked', p_scheduled_at, p_duration_minutes,
    coalesce(p_timezone, 'America/New_York'),
    nullif(p_highlights, '')
  ) returning id into v_order_id;

  -- 4. line items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_price := price_for_sqft((v_item->>'product_id')::uuid, p_sqft);
    v_total := v_total + v_price * coalesce((v_item->>'quantity')::int, 1);
    v_duration := v_duration + coalesce(
      (select duration_minutes from products where id = (v_item->>'product_id')::uuid), 0
    ) * coalesce((v_item->>'quantity')::int, 1);

    insert into order_items (
      order_id, product_id, description, quantity, unit_price_cents,
      total_cents, duration_minutes
    )
    select v_order_id, p.id, p.name,
           coalesce((v_item->>'quantity')::int, 1), v_price,
           v_price * coalesce((v_item->>'quantity')::int, 1),
           p.duration_minutes
    from products p where p.id = (v_item->>'product_id')::uuid;
  end loop;

  update orders
    set subtotal_cents = v_total,
        total_cents = v_total,
        duration_minutes = greatest(v_duration, p_duration_minutes)
    where id = v_order_id;

  insert into activity_log (order_id, listing_id, actor_type, action, details)
  values (v_order_id, v_listing_id, 'client', 'order_booked',
    jsonb_build_object('source', 'wizard', 'items', p_items));

  return v_order_id;
end; $$;

grant execute on function create_booking_v2(
  text, text, text, text,
  text, text, text, text, text,
  double precision, double precision, int,
  timestamptz, int, text, text, text,
  jsonb
) to anon, authenticated;

grant execute on function price_for_sqft(uuid, int) to anon, authenticated;
