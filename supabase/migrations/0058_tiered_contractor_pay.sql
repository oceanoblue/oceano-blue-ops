-- =============================================================
-- 0058 — Tiered contractor pay (small/large homes + 360 add-on)
-- =============================================================
-- Pay model change (owner decision 2026-08-06): the flat per-property rate
-- from 0053 becomes size-tiered —
--   * small home  (sqft below business_settings.pay_small_max_sqft): $60
--   * larger home (sqft at/above the cutoff):                        $75
--   * 360 photos add-on (shoot includes the '360' service):         +$20
-- A shoot logged without sqft pays the small rate; the office can adjust
-- before settling. Rates stay per-contractor columns (business defaults
-- above), and the sqft cutoff is business-wide — configurable, never
-- hardcoded in app logic. Snapshot semantics are unchanged: the computed
-- rate is written to orders.pay_amount_cents when the shoot is logged, so
-- later rate/cutoff changes never rewrite what's already owed.
-- =============================================================

-- 1. Business-wide size cutoff ------------------------------------------------
alter table business_settings
  add column if not exists pay_small_max_sqft int not null default 2000;

-- 2. Per-contractor tier rates ------------------------------------------------
alter table contractors
  add column if not exists pay_rate_small_cents int not null default 6000,
  add column if not exists pay_rate_large_cents int not null default 7500,
  add column if not exists pay_rate_360_cents   int not null default 2000;

comment on column contractors.pay_rate_cents is
  'DEPRECATED (0058): legacy flat per-property rate. Superseded by pay_rate_small_cents / pay_rate_large_cents / pay_rate_360_cents.';

-- 3. Tier-aware rate snapshot in create_field_shoot ---------------------------
-- Same signature as 0053; only the v_rate computation changes.
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
  v_small      int;
  v_large      int;
  v_360        int;
  v_cutoff     int;
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

  select pay_rate_small_cents, pay_rate_large_cents, pay_rate_360_cents
    into v_small, v_large, v_360
    from contractors where id = v_contractor;
  select pay_small_max_sqft into v_cutoff from business_settings where id = true;

  -- No sqft recorded → small rate (owner decision; office adjusts if needed).
  v_rate := case
    when p_sqft is not null and p_sqft >= coalesce(v_cutoff, 2000) then coalesce(v_large, 0)
    else coalesce(v_small, 0)
  end;
  if p_services ? '360' then
    v_rate := v_rate + coalesce(v_360, 0);
  end if;

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
    v_rate,
    case when coalesce(jsonb_array_length(p_services),0) > 0
         then 'Field services: ' || (select string_agg(t.v, ', ') from jsonb_array_elements_text(p_services) as t(v))
         else null end
  ) returning id into v_order;

  return v_order;
end;
$$;

-- Grants are already scoped by 0053 (authenticated only); create or replace
-- preserves them, so nothing to re-grant.
