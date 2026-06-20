-- 0042_double_booking_guard.sql
-- Prevent double-booking a photographer at the database level.
--
-- Until now slot filtering was advisory client-side only: the availability API
-- hides taken slots, but the write paths (public booking RPC + the dashboard
-- "new order" direct insert + team re-assignment) performed a blind insert/update
-- with NO conflict check or lock. A stale client, a concurrent booking, or a
-- direct POST could put two shoots on the same photographer at the same time.
--
-- This adds a single BEFORE INSERT/UPDATE trigger on `orders` so the guard covers
-- EVERY write path, and serializes concurrent attempts for the same photographer
-- with a transaction-scoped advisory lock (read-committed + the lock means the
-- second writer sees the first writer's committed row before its own check runs).
--
-- The conflict window honours the org-wide buffer (business_settings.buffer_minutes,
-- the same value the availability slot generator uses) so back-to-back shoots that
-- would not leave travel/prep time are also rejected.
--
-- Additive + idempotent. No table data changes.

begin;

-- -----------------------------------------------------------------
-- Guard trigger: reject an order that overlaps another active order
-- for the same photographer (buffer-aware).
-- -----------------------------------------------------------------
create or replace function check_order_no_double_book()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buffer_min int;
  v_buffer     interval;
  v_start      timestamptz;
  v_end        timestamptz;
  v_conflict   record;
begin
  -- Only guard concrete, assigned, active bookings. Unassigned shells, drafts,
  -- and cancellations cannot double-book a specific person.
  if NEW.photographer_id is null
     or NEW.scheduled_at is null
     or NEW.status in ('cancelled', 'draft') then
    return NEW;
  end if;

  -- On UPDATE, skip the check (and the lock) when nothing relevant to a
  -- conflict actually changed — avoids serializing unrelated edits.
  if TG_OP = 'UPDATE'
     and NEW.photographer_id  is not distinct from OLD.photographer_id
     and NEW.scheduled_at      is not distinct from OLD.scheduled_at
     and NEW.duration_minutes  is not distinct from OLD.duration_minutes
     and NEW.status            is not distinct from OLD.status then
    return NEW;
  end if;

  select coalesce(buffer_minutes, 30) into v_buffer_min
  from business_settings where id = true;
  v_buffer := make_interval(mins => coalesce(v_buffer_min, 30));

  v_start := NEW.scheduled_at;
  v_end   := NEW.scheduled_at + make_interval(mins => coalesce(NEW.duration_minutes, 60));

  -- Serialize concurrent writes for this photographer so the conflict check
  -- below cannot race two simultaneous bookings into the same slot.
  perform pg_advisory_xact_lock(hashtext(NEW.photographer_id::text)::bigint);

  select o.id, o.scheduled_at into v_conflict
  from orders o
  where o.photographer_id = NEW.photographer_id
    and o.id <> NEW.id
    and o.scheduled_at is not null
    and o.status not in ('cancelled', 'draft')
    -- Buffered overlap: existing [start-buf, end+buf) intersects the new window.
    and (v_start - v_buffer) < (o.scheduled_at + make_interval(mins => coalesce(o.duration_minutes, 60)))
    and (v_end   + v_buffer) > o.scheduled_at
  limit 1;

  if found then
    raise exception
      'slot_unavailable: photographer % is already booked around % (conflicting order %)',
      NEW.photographer_id, v_conflict.scheduled_at, v_conflict.id
      using errcode = 'exclusion_violation';  -- SQLSTATE 23P01, surfaced as 409 by the API
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_orders_no_double_book on orders;
create trigger trg_orders_no_double_book
  before insert or update on orders
  for each row execute function check_order_no_double_book();

-- -----------------------------------------------------------------
-- Make the public booking RPC assign the photographer in-transaction.
-- Previously the order shell was inserted with photographer_id = NULL and
-- stamped afterwards in a separate UPDATE, so a conflict would leave an
-- orphaned unassigned order. Adding the photographer to the INSERT means the
-- guard trigger fires inside the RPC's own transaction: on conflict the whole
-- booking rolls back cleanly.
--
-- p_photographer_id is appended with DEFAULT NULL so the change is backward
-- compatible with any caller that omits it. Adding a parameter changes the
-- function signature, so the old 18-arg overload is dropped first (otherwise an
-- 18-arg call would be ambiguous between it and the new defaulted 19-arg one).
-- -----------------------------------------------------------------
drop function if exists create_booking_v2(
  text, text, text, text,
  text, text, text, text, text,
  double precision, double precision, int,
  timestamptz, int, text, text, text,
  jsonb
);

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
  p_items jsonb,

  p_photographer_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = public as $$
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

  -- 3. order shell (photographer assigned here so the double-book guard runs
  --    atomically — a conflict rolls the whole booking back).
  insert into orders (
    listing_id, client_id, status, scheduled_at, duration_minutes,
    timezone, client_notes, photographer_id
  ) values (
    v_listing_id, v_client_id, 'booked', p_scheduled_at, p_duration_minutes,
    coalesce(p_timezone, 'America/New_York'),
    nullif(p_highlights, ''), p_photographer_id
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

-- Restore the grants the dropped overload had.
grant execute on function create_booking_v2(
  text, text, text, text,
  text, text, text, text, text,
  double precision, double precision, int,
  timestamptz, int, text, text, text,
  jsonb, uuid
) to anon, authenticated;

commit;

-- Verify after applying:
--   -- trigger present:
--   select tgname from pg_trigger where tgrelid = 'orders'::regclass
--     and tgname = 'trg_orders_no_double_book';
--   -- a conflicting insert should raise SQLSTATE 23P01 (slot_unavailable).
