-- =============================================================
-- Helpful views + RPCs
-- =============================================================

-- Pipeline counts for the dashboard
create or replace view pipeline_counts as
  select status, count(*)::int as count
  from orders
  group by status;

-- Orders with denormalized client + listing fields for list views
create or replace view orders_enriched as
  select
    o.*,
    c.full_name as client_name,
    c.email     as client_email,
    c.brokerage as client_brokerage,
    l.address_line1, l.city, l.state, l.zip,
    tm_p.full_name as photographer_name,
    tm_e.full_name as editor_name
  from orders o
  join clients c   on c.id = o.client_id
  join listings l  on l.id = o.listing_id
  left join team_members tm_p on tm_p.id = o.photographer_id
  left join team_members tm_e on tm_e.id = o.editor_id;

-- RPC: create a draft order from the public booking form
create or replace function create_draft_order(
  p_client_email text,
  p_client_name  text,
  p_client_phone text,
  p_client_brokerage text,
  p_address_line1 text,
  p_city text,
  p_state text,
  p_zip text,
  p_bedrooms int,
  p_bathrooms numeric,
  p_sqft int,
  p_requested_at timestamptz,
  p_services text[],
  p_notes text
) returns uuid
language plpgsql security definer as $$
declare
  v_client_id uuid;
  v_listing_id uuid;
  v_order_id uuid;
  v_svc text;
begin
  -- upsert client
  insert into clients (email, full_name, phone, brokerage)
  values (p_client_email, p_client_name, p_client_phone, p_client_brokerage)
  on conflict (email) do update
    set full_name = excluded.full_name,
        phone     = coalesce(excluded.phone, clients.phone),
        brokerage = coalesce(excluded.brokerage, clients.brokerage)
  returning id into v_client_id;

  -- listing
  insert into listings (
    client_id, address_line1, city, state, zip,
    bedrooms, bathrooms, sqft, status
  ) values (
    v_client_id, p_address_line1, p_city, p_state, p_zip,
    p_bedrooms, p_bathrooms, p_sqft, 'draft'
  ) returning id into v_listing_id;

  -- order
  insert into orders (
    listing_id, client_id, status, scheduled_at, client_notes
  ) values (
    v_listing_id, v_client_id, 'draft', p_requested_at, p_notes
  ) returning id into v_order_id;

  -- services
  foreach v_svc in array p_services loop
    insert into order_services (order_id, service_type, description, quantity)
    values (v_order_id, v_svc::service_type, v_svc, 1);
  end loop;

  insert into activity_log (order_id, listing_id, actor_type, action, details)
  values (v_order_id, v_listing_id, 'client', 'order_drafted',
    jsonb_build_object('source', 'booking_form'));

  return v_order_id;
end;
$$;

grant execute on function create_draft_order(
  text, text, text, text, text, text, text, text,
  int, numeric, int, timestamptz, text[], text
) to anon, authenticated;
