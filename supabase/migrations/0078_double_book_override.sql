-- =============================================================
-- 0078 — Staff override for the double-book travel buffer
-- =============================================================
-- Public bookings must still respect the 30-min travel buffer, but staff adding
-- or moving shoots manually (e.g. two adjacent-lot shoots for one builder) need
-- to override it with a confirmation. The guard now skips its check when a
-- transaction-local flag `app.allow_double_book = 'on'` is set — which only the
-- staff-gated set_order_schedule() RPC does. The public create_booking_v2 RPC
-- never sets it, so client-side bookings stay guarded.
-- =============================================================

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
  -- Staff manual override (set for this transaction by set_order_schedule).
  if coalesce(current_setting('app.allow_double_book', true), '') = 'on' then
    return NEW;
  end if;

  if NEW.photographer_id is null
     or NEW.scheduled_at is null
     or NEW.status in ('cancelled', 'draft') then
    return NEW;
  end if;

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

  perform pg_advisory_xact_lock(hashtext(NEW.photographer_id::text)::bigint);

  select o.id, o.scheduled_at into v_conflict
  from orders o
  where o.photographer_id = NEW.photographer_id
    and o.id <> NEW.id
    and o.scheduled_at is not null
    and o.status not in ('cancelled', 'draft')
    and (v_start - v_buffer) < (o.scheduled_at + make_interval(mins => coalesce(o.duration_minutes, 60)))
    and (v_end   + v_buffer) > o.scheduled_at
  limit 1;

  if found then
    raise exception
      'slot_unavailable: photographer % is already booked around % (conflicting order %)',
      NEW.photographer_id, v_conflict.scheduled_at, v_conflict.id
      using errcode = 'exclusion_violation';
  end if;

  return NEW;
end;
$$;

-- Staff-gated reschedule that can optionally override the travel buffer.
create or replace function set_order_schedule(
  p_order_id uuid,
  p_scheduled_at timestamptz,
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
    perform set_config('app.allow_double_book', 'on', true); -- transaction-local
  end if;
  update orders set scheduled_at = p_scheduled_at, updated_at = now() where id = p_order_id;
  if not found then
    raise exception 'order_not_found';
  end if;
end;
$$;

revoke all on function set_order_schedule(uuid, timestamptz, boolean) from public, anon;
grant execute on function set_order_schedule(uuid, timestamptz, boolean) to authenticated;
