-- Save both ends together; keep existing clients of set_order_schedule working.
create or replace function public.set_order_schedule_window(
  p_order_id uuid,
  p_scheduled_at timestamptz,
  p_ends_at timestamptz,
  p_previous_scheduled_at timestamptz,
  p_previous_duration integer,
  p_allow_overlap boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_minutes numeric;
begin
  if not coalesce(public.is_team_member(),false) then raise exception 'forbidden'; end if;
  if p_scheduled_at is null or p_ends_at is null
    or not isfinite(p_scheduled_at) or not isfinite(p_ends_at) then
    raise exception 'invalid_schedule_window';
  end if;
  v_minutes := extract(epoch from (p_ends_at-p_scheduled_at))/60;
  if v_minutes < 15 or v_minutes > 720 or v_minutes <> trunc(v_minutes) then
    raise exception 'invalid_schedule_window';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  -- A repeated save of the same result is a no-op.
  if v_order.scheduled_at is not distinct from p_scheduled_at
    and v_order.duration_minutes = v_minutes::integer then return; end if;
  if v_order.scheduled_at is distinct from p_previous_scheduled_at
    or v_order.duration_minutes is distinct from p_previous_duration then
    raise exception 'order_changed';
  end if;
  perform set_config('app.allow_double_book',case when p_allow_overlap then 'on' else 'off' end,true);
  update public.orders set scheduled_at=p_scheduled_at,duration_minutes=v_minutes::integer,updated_at=now()
    where id=p_order_id;
  perform set_config('app.allow_double_book','off',true);
end;
$$;
revoke all on function public.set_order_schedule_window(uuid,timestamptz,timestamptz,timestamptz,integer,boolean) from public,anon;
grant execute on function public.set_order_schedule_window(uuid,timestamptz,timestamptz,timestamptz,integer,boolean) to authenticated;
