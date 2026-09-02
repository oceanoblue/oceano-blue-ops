-- =============================================================
-- 0079 — Staff overlap-override for reassignment + office new-shoot
-- =============================================================
-- Extends the 0078 buffer-override pattern to the other two manual write paths.
-- Public bookings still can't override (create_booking_v2 never sets the flag).
-- =============================================================

-- Reassign a shoot's photographer/contractor, optionally overriding the buffer.
-- Called with the user's session (client-side), so it verifies staff itself.
create or replace function assign_order_shooter(
  p_order_id uuid,
  p_photographer_id uuid default null,
  p_contractor_id uuid default null,
  p_pay_amount_cents int default 0,
  p_allow_overlap boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_team_member() then
    raise exception 'forbidden';
  end if;
  if p_allow_overlap then
    perform set_config('app.allow_double_book', 'on', true);
  end if;
  update orders set
    photographer_id          = p_photographer_id,
    contractor_id            = p_contractor_id,
    pay_amount_cents         = p_pay_amount_cents,
    contractor_response      = null,   -- reassignment resets any prior accept/decline
    contractor_responded_at  = null,
    contractor_response_note = null,
    updated_at               = now()
  where id = p_order_id;
  if not found then
    raise exception 'order_not_found';
  end if;
end;
$$;

revoke all on function assign_order_shooter(uuid, uuid, uuid, int, boolean) from public, anon;
grant execute on function assign_order_shooter(uuid, uuid, uuid, int, boolean) to authenticated;

-- Insert an office order (whitelisted columns), optionally overriding the buffer.
-- Called by the server via the SERVICE-ROLE admin client (the /api/shoots route
-- already staff-gates the caller), so this is service_role-only — NOT grantable
-- to authenticated, and it does not re-check is_team_member (the admin client has
-- no auth.uid()).
create or replace function create_office_order(
  p_order jsonb,
  p_allow_overlap boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_num int;
begin
  if p_allow_overlap then
    perform set_config('app.allow_double_book', 'on', true);
  end if;
  insert into orders (
    listing_id, client_id, status, scheduled_at, duration_minutes, timezone,
    package_name, internal_notes, contractor_id, photographer_id, pay_amount_cents
  ) values (
    (p_order->>'listing_id')::uuid,
    (p_order->>'client_id')::uuid,
    coalesce((p_order->>'status')::order_status, 'booked'),
    (p_order->>'scheduled_at')::timestamptz,
    coalesce((p_order->>'duration_minutes')::int, 60),
    coalesce(p_order->>'timezone', 'America/New_York'),
    nullif(p_order->>'package_name', ''),
    nullif(p_order->>'internal_notes', ''),
    (p_order->>'contractor_id')::uuid,
    (p_order->>'photographer_id')::uuid,
    coalesce((p_order->>'pay_amount_cents')::int, 0)
  ) returning orders.id, orders.order_number into v_id, v_num;
  return jsonb_build_object('id', v_id, 'order_number', v_num);
end;
$$;

revoke all on function create_office_order(jsonb, boolean) from public, anon, authenticated;
grant execute on function create_office_order(jsonb, boolean) to service_role;
