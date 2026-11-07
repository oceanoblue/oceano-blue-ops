begin;
set local lock_timeout = '5s';

-- Keep the existing 60-minute booking estimate consistent for selections whose
-- catalog durations sum to zero. Product eligibility, prices, nonzero durations,
-- routing, assignment, idempotency and saved orders retain their existing rules.
-- Definitions preserve the live booking functions as reviewed on 2026-11-07.

CREATE OR REPLACE FUNCTION public.commit_public_booking_core(p_payload jsonb, p_request_id uuid, p_request_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_order uuid;
  v_existing public.booking_requests;
  v_duration int;
  v_start timestamptz := (p_payload->>'scheduled_at')::timestamptz;
  v_ph uuid := (p_payload->>'photographer_id')::uuid;
  v_settings public.business_settings;
  v_member record;
  v_item jsonb;
  v_count int;
  v_audience text := case when p_payload->>'project_type' in ('architectural','interior_design') then 'architectural' else 'real_estate' end;
begin
  if p_request_id is null or p_request_hash is null or length(p_request_hash) <> 64 then raise exception 'invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 723));
  select * into v_existing from public.booking_requests where id=p_request_id;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception 'idempotency_conflict' using errcode='22023'; end if;
    return v_existing.order_id;
  end if;
  if v_ph is null or v_start is null then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  if p_payload->'items' is null or jsonb_typeof(p_payload->'items') <> 'array' or jsonb_array_length(p_payload->'items') not between 1 and 30 then raise exception 'invalid_items'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'items') x group by x->>'product_id' having count(*)>1) then raise exception 'duplicate_items'; end if;
  v_duration:=0;
  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    if v_item->>'quantity' is null or (v_item->>'quantity')::int not between 1 and 20 then raise exception 'invalid_quantity'; end if;
    select duration_minutes into v_count from public.products where id=(v_item->>'product_id')::uuid and is_active and audiences @> array[v_audience];
    if not found then raise exception 'invalid_product'; end if;
    v_duration := v_duration + v_count*(v_item->>'quantity')::int;
  end loop;
  -- Match the booking wizard's existing estimate for services without a duration.
  if v_duration = 0 then v_duration := 60; end if;
  if v_duration is null or v_duration not between 15 and 720 then raise exception 'invalid_duration'; end if;
  select * into v_settings from public.business_settings where id=true;
  if v_start < now() + make_interval(hours=>coalesce(v_settings.min_notice_hours,4))
     or (v_start at time zone coalesce(v_settings.default_timezone,'America/New_York'))::date >
        (now() at time zone coalesce(v_settings.default_timezone,'America/New_York'))::date + coalesce(v_settings.max_notice_days,30) then
    raise exception 'slot_unavailable' using errcode='23P01';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_ph::text)::bigint);
  if not exists(select 1 from public.team_members where id=v_ph and is_active and role in ('admin','photographer')) then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  if not exists(
    select 1 from public.team_availability a where a.team_member_id=v_ph and a.is_active
    and a.day_of_week=extract(dow from v_start at time zone a.timezone)
    and v_start >= (((v_start at time zone a.timezone)::date + a.start_local) at time zone a.timezone)
    and v_start + make_interval(mins=>v_duration) <= (((v_start at time zone a.timezone)::date + a.end_local) at time zone a.timezone)
  ) then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  if exists(select 1 from public.schedule_blocks b where b.team_member_id=v_ph and not b.is_available
    and v_start < b.ends_at + make_interval(mins=>coalesce(v_settings.buffer_minutes,30))
    and v_start + make_interval(mins=>v_duration+coalesce(v_settings.buffer_minutes,30)) > b.starts_at) then
    raise exception 'slot_unavailable' using errcode='23P01';
  end if;
  v_order := public.create_booking_v2(
    p_payload->>'client_email',p_payload->>'client_name',p_payload->>'client_phone',p_payload->>'client_brokerage',
    p_payload->>'address_line1',p_payload->>'address_line2',p_payload->>'city',p_payload->>'state',p_payload->>'zip',
    (p_payload->>'lat')::double precision,(p_payload->>'lng')::double precision,(p_payload->>'sqft')::int,
    v_start,v_duration,p_payload->>'timezone',p_payload->>'access_method',p_payload->>'highlights',p_payload->'items',v_ph
  );
  update public.orders set project_type=coalesce(p_payload->>'project_type','mls_real_estate')::project_type where id=v_order;
  -- Complete assignment in the same transaction as the order and follow-ups.
  select id,pay_rate_cents into v_member from public.contractors where team_member_id=v_ph and is_active limit 1;
  if found then update public.orders set contractor_id=v_member.id,pay_amount_cents=coalesce(v_member.pay_rate_cents,0) where id=v_order; end if;
  insert into public.booking_requests(id,request_hash,order_id) values(p_request_id,p_request_hash,v_order);
  insert into public.booking_followups(order_id,kind,recipient,payload) values
    (v_order,'calendar','',p_payload),(v_order,'client_email',p_payload->>'client_email',p_payload);
  insert into public.booking_followups(order_id,kind,recipient,payload)
    select v_order,'office_email',lower(email),p_payload from public.team_members where is_active and role='admin' and email is not null and email<>'' on conflict do nothing;
  insert into public.booking_followups(order_id,kind,recipient,payload)
    select v_order,'office_sms',phone,p_payload from public.team_members where is_active and role='admin' and phone is not null and phone<>'' on conflict do nothing;
  return v_order;
end;
$function$;

CREATE OR REPLACE FUNCTION public.commit_public_booking_single_crew(p_payload jsonb, p_request_id uuid, p_request_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_order uuid; v_existing public.booking_requests; v_ids uuid[]; v_duration integer; v_timeout integer;
begin
  -- Lock the request before eligibility checks so replay works after the slot is taken.
  perform pg_advisory_xact_lock(hashtext(p_request_id::text)::bigint);
  select * into v_existing from public.booking_requests where id=p_request_id;
  if found then
    if v_existing.request_hash<>p_request_hash then raise exception 'idempotency_conflict'; end if;
    return v_existing.order_id;
  end if;
  if not (select scheduling_dispatch_enabled from public.business_settings where id=true) then return public.commit_public_booking_core(p_payload,p_request_id,p_request_hash); end if;
  select array_agg((x->>'product_id')::uuid),sum(p.duration_minutes*(x->>'quantity')::integer) into v_ids,v_duration
    from jsonb_array_elements(p_payload->'items') x join public.products p on p.id=(x->>'product_id')::uuid;
  -- Match the booking wizard's existing estimate for services without a duration.
  if v_duration = 0 then v_duration := 60; end if;
  perform public.assert_routing_slot((p_payload->>'photographer_id')::uuid,(p_payload->>'scheduled_at')::timestamptz,v_duration,v_ids,p_payload->>'zip');
  v_order:=public.commit_public_booking_core(p_payload,p_request_id,p_request_hash);
  select assignment_timeout_minutes into v_timeout from public.business_settings where id=true;
  update public.orders set auto_dispatch=true,assignment_round=1,assignment_attempted_ids=array[photographer_id],
    -- The core may already have opened a contractor assignment version. Preserve
    -- that policy; the BEFORE trigger initializes internal assignments at round 1.
    assignment_state=case when assignment_round>0 then assignment_state else 'awaiting_response' end,
    assignment_due_at=case when assignment_round>0 then assignment_due_at else least(scheduled_at,now()+make_interval(mins=>v_timeout)) end
    where id=v_order;
  update public.booking_followups f set payload=f.payload||jsonb_build_object('event','assignment_pending','assignment_round',1)
    from public.orders o where f.order_id=v_order and o.id=v_order and o.assignment_state='awaiting_response' and f.kind='client_email' and f.event_key='booking';
  return v_order;
end;$function$;

commit;
