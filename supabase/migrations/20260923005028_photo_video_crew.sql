begin;
alter table public.orders add column videographer_id uuid references public.team_members(id);
create index orders_videographer_schedule_idx on public.orders(videographer_id,scheduled_at) where videographer_id is not null;
alter table public.photographer_routing add column capture_skills text[] not null default array['photography']::text[]
  check(capture_skills <@ array['photography','videography','tour_360','drone','floor_plan']::text[]);
update public.photographer_routing r set capture_skills=array['photography','videography','tour_360','drone','floor_plan']::text[]
  from public.team_members t where t.id=r.team_member_id and t.role='admin';

create function public.product_capture_skills(p_kind text,p_name text) returns text[]
language sql immutable set search_path=public as $$
  select case
    when lower(p_name) ~ 'virtual staging|virtual twilight|delivery|rush|vertical social cut|weekend|holiday' then '{}'::text[]
    when lower(p_name) ~ 'drone' then case when lower(p_name) ~ 'video' then array['drone','videography'] else array['drone'] end
    when p_kind='video' or lower(p_name) ~ 'videography|video|reel' then array['videography']
    when p_kind='tour' or lower(p_name) ~ '360|matterport|virtual tour|3d home' then array['tour_360']
    when p_kind='floor_plan' or lower(p_name) ~ 'floor plan' then array['floor_plan']
    else array['photography'] end;
$$;

create or replace function public.check_order_no_double_book() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_member uuid; v_ids uuid[]; v_buffer int; v_conflict uuid; v_video_changed boolean; v_photo_changed boolean;
begin
  v_video_changed := tg_op='INSERT'; v_photo_changed := tg_op='INSERT';
  if tg_op='UPDATE' then
    v_video_changed := new.videographer_id is distinct from old.videographer_id;
    v_photo_changed := new.photographer_id is distinct from old.photographer_id;
  end if;
  -- Role restrictions cannot be overridden along with the travel buffer.
  if v_video_changed and new.videographer_id is not null and not exists(
    select 1 from public.team_members t join public.photographer_routing r on r.team_member_id=t.id
    where t.id=new.videographer_id and t.is_active and 'videography'=any(r.capture_skills)
  ) then raise exception 'videographer_not_qualified'; end if;
  if v_photo_changed and new.photographer_id is not null and not exists(
    select 1 from public.team_members t join public.photographer_routing r on r.team_member_id=t.id
    where t.id=new.photographer_id and t.is_active and r.capture_skills && array['photography','tour_360','videography']::text[]
  ) then raise exception 'photographer_not_qualified'; end if;
  if coalesce(current_setting('app.allow_double_book',true),'')='on' then return new; end if;
  if new.scheduled_at is null or new.status in ('cancelled','draft') then return new; end if;
  if tg_op='UPDATE' and not v_video_changed and not v_photo_changed
    and new.contractor_id is not distinct from old.contractor_id
    and new.scheduled_at is not distinct from old.scheduled_at
    and new.duration_minutes is not distinct from old.duration_minutes
    and new.status is not distinct from old.status then return new; end if;
  select array_agg(distinct id order by id) into v_ids from unnest(array[
    coalesce(new.photographer_id,(select team_member_id from public.contractors where id=new.contractor_id)),new.videographer_id]) id where id is not null;
  select coalesce(buffer_minutes,30) into v_buffer from public.business_settings where id=true;
  foreach v_member in array coalesce(v_ids,'{}'::uuid[]) loop
    perform pg_advisory_xact_lock(hashtext(v_member::text)::bigint);
  end loop;
  foreach v_member in array coalesce(v_ids,'{}'::uuid[]) loop
    select o.id into v_conflict from public.orders o left join public.contractors c on c.id=o.contractor_id
    where o.id<>new.id and o.status not in ('cancelled','draft')
      and (coalesce(o.photographer_id,c.team_member_id)=v_member or o.videographer_id=v_member)
      and new.scheduled_at-make_interval(mins=>coalesce(v_buffer,30))<o.scheduled_at+make_interval(mins=>coalesce(o.duration_minutes,60))
      and new.scheduled_at+make_interval(mins=>coalesce(new.duration_minutes,60)+coalesce(v_buffer,30))>o.scheduled_at limit 1;
    if found then raise exception 'slot_unavailable: a crew member has another shoot or travel conflict (%)',v_conflict using errcode='23P01'; end if;
  end loop;
  return new;
end;$$;

create function public.set_order_crew(p_order uuid,p_photographer uuid,p_contractor uuid,p_videographer uuid,p_expected_updated_at timestamptz,p_allow_overlap boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare o public.orders; c public.contractors; v_photo uuid; v_rate integer;
begin
  if not coalesce(public.is_team_member(),false) then raise exception 'forbidden'; end if;
  select * into o from public.orders where id=p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  v_photo:=p_photographer; v_rate:=o.pay_amount_cents;
  if p_contractor is not null then
    select * into c from public.contractors where id=p_contractor and is_active;
    if not found or c.team_member_id is null or c.team_member_id is distinct from p_photographer then raise exception 'invalid_contractor'; end if;
    v_photo:=c.team_member_id;
    if p_contractor is distinct from o.contractor_id then v_rate:=coalesce(c.pay_rate_cents,0); end if;
  else v_rate:=0; end if;
  if v_photo is not null and not exists(select 1 from public.team_members t join public.photographer_routing r on r.team_member_id=t.id
    where t.id=v_photo and t.is_active and r.capture_skills && array['photography','tour_360']::text[]) then raise exception 'photographer_not_qualified'; end if;
  if o.photographer_id is not distinct from v_photo and o.contractor_id is not distinct from p_contractor and o.videographer_id is not distinct from p_videographer then return; end if;
  if o.updated_at is distinct from p_expected_updated_at then raise exception 'order_changed'; end if;
  perform set_config('app.allow_double_book',case when p_allow_overlap then 'on' else 'off' end,true);
  update public.orders set photographer_id=v_photo,contractor_id=p_contractor,videographer_id=p_videographer,pay_amount_cents=v_rate,
    auto_dispatch=false,updated_at=now() where id=p_order;
  perform set_config('app.allow_double_book','off',true);
end;$$;
revoke all on function public.set_order_crew(uuid,uuid,uuid,uuid,timestamptz,boolean) from public,anon;
grant execute on function public.set_order_crew(uuid,uuid,uuid,uuid,timestamptz,boolean) to authenticated;

-- Video is an office-managed crew role. The lead photographer's existing
-- acceptance workflow is retained; a solo public booking has one person in both roles.
create function public.queue_video_calendar_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (new.videographer_id is distinct from old.videographer_id or new.photographer_id is distinct from old.photographer_id or new.contractor_id is distinct from old.contractor_id) and new.scheduled_at>now()
    and new.archived_at is null and new.status not in ('draft','cancelled','delivered') then
    if (select scheduling_dispatch_enabled from public.business_settings where id=true) and new.assignment_round<>old.assignment_round then return new; end if;
    -- A public booking already queued its first calendar snapshot in this transaction.
    if exists(select 1 from public.booking_followups where order_id=new.id and kind='calendar' and status='pending' and created_at=now()) then return new; end if;
    insert into public.booking_followups(order_id,kind,recipient,payload,event_key)
      values(new.id,'calendar','',jsonb_build_object('scheduled_at',new.scheduled_at,'timezone',new.timezone),'crew-'||gen_random_uuid()::text);
  end if;
  return new;
end;$$;
revoke all on function public.queue_video_calendar_change() from public,anon,authenticated;
create trigger queue_video_calendar_change after update on public.orders for each row execute function public.queue_video_calendar_change();

create or replace function public.assert_routing_slot(p_member uuid,p_at timestamptz,p_duration integer,p_products uuid[],p_zip text,p_order uuid default null)
returns void language plpgsql security invoker set search_path=public as $$
declare r public.photographer_routing; v_buffer int;
begin
  perform pg_advisory_xact_lock(hashtext(p_member::text)::bigint);
  select * into r from public.photographer_routing where team_member_id=p_member;
  if not found or not r.enabled or not exists(select 1 from public.team_members where id=p_member and is_active and role in ('admin','photographer'))
    or (r.product_ids is not null and (coalesce(cardinality(p_products),0)=0 or not p_products <@ r.product_ids))
    or exists(select 1 from public.products p where p.id=any(p_products) and not public.product_capture_skills(p.kind::text,p.name) <@ r.capture_skills)
    or (cardinality(r.service_zips)>0 and not left(coalesce(p_zip,''),5)=any(r.service_zips)) then
    raise exception 'slot_unavailable: photographer not eligible' using errcode='23P01';
  end if;
  if not exists(select 1 from public.team_availability a where a.team_member_id=p_member and a.is_active
    and a.day_of_week=extract(dow from p_at at time zone a.timezone)
    and p_at>=(((p_at at time zone a.timezone)::date+a.start_local) at time zone a.timezone)
    and p_at+make_interval(mins=>p_duration)<=(((p_at at time zone a.timezone)::date+a.end_local) at time zone a.timezone)) then
    raise exception 'slot_unavailable: outside working hours' using errcode='23P01';
  end if;
  select greatest(coalesce(buffer_minutes,30),r.travel_minutes) into v_buffer from public.business_settings where id=true;
  if exists(select 1 from public.schedule_blocks b where b.team_member_id=p_member and not b.is_available
    and p_at<b.ends_at+make_interval(mins=>v_buffer) and p_at+make_interval(mins=>p_duration+v_buffer)>b.starts_at) then
    raise exception 'slot_unavailable: time off' using errcode='23P01';
  end if;
  if exists(select 1 from public.orders o left join public.contractors c on c.id=o.contractor_id left join public.listings l on l.id=o.listing_id
    where (coalesce(c.team_member_id,o.photographer_id)=p_member or o.videographer_id=p_member) and o.id is distinct from p_order and o.status not in ('cancelled','draft')
    and p_at < o.scheduled_at+make_interval(mins=>coalesce(o.duration_minutes,60)+greatest(v_buffer,case when left(coalesce(l.zip,''),5)<>left(coalesce(p_zip,''),5) then r.cross_zip_minutes else 0 end))
    and p_at+make_interval(mins=>p_duration+greatest(v_buffer,case when left(coalesce(l.zip,''),5)<>left(coalesce(p_zip,''),5) then r.cross_zip_minutes else 0 end))>o.scheduled_at) then
    raise exception 'slot_unavailable: travel conflict' using errcode='23P01';
  end if;
end;$$;

alter function public.commit_public_booking(jsonb,uuid,text) rename to commit_public_booking_single_crew;
create function public.commit_public_booking(p_payload jsonb,p_request_id uuid,p_request_hash text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare v_order uuid; v_member uuid; v_product uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_request_id::text)::bigint);
  -- The old function verifies replays; never restore a later manual video assignment on retry.
  if exists(select 1 from public.booking_requests where id=p_request_id) then
    return public.commit_public_booking_single_crew(p_payload,p_request_id,p_request_hash);
  end if;
  v_member:=(p_payload->>'photographer_id')::uuid;
  if exists(select 1 from jsonb_array_elements(p_payload->'items') x join public.products p on p.id=(x->>'product_id')::uuid
    where not public.product_capture_skills(p.kind::text,p.name) <@ coalesce((select capture_skills from public.photographer_routing where team_member_id=v_member),'{}'::text[])) then
    raise exception 'slot_unavailable: capture skills do not cover the booking' using errcode='23P01';
  end if;
  v_order:=public.commit_public_booking_single_crew(p_payload,p_request_id,p_request_hash);
  if exists(select 1 from jsonb_array_elements(p_payload->'items') x join public.products p on p.id=(x->>'product_id')::uuid
    where 'videography'=any(public.product_capture_skills(p.kind::text,p.name))) then
    update public.orders set videographer_id=v_member where id=v_order;
  end if;
  return v_order;
end;$$;
revoke all on function public.commit_public_booking(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.commit_public_booking(jsonb,uuid,text) to service_role;

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
    package_name, internal_notes, contractor_id, photographer_id, videographer_id, pay_amount_cents
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
    (p_order->>'videographer_id')::uuid,
    coalesce((p_order->>'pay_amount_cents')::int, 0)
  ) returning orders.id, orders.order_number into v_id, v_num;
  return jsonb_build_object('id', v_id, 'order_number', v_num);
end;
$$;

revoke all on function create_office_order(jsonb, boolean) from public, anon, authenticated;
grant execute on function create_office_order(jsonb, boolean) to service_role;

alter function public.commit_client_reschedule(uuid,uuid,uuid[],timestamptz,timestamptz,uuid,integer) rename to commit_client_reschedule_single_crew;
create function public.commit_client_reschedule(p_request_id uuid,p_order_id uuid,p_client_ids uuid[],p_previous timestamptz,p_scheduled_at timestamptz,p_photographer_id uuid,p_duration integer)
returns timestamptz language plpgsql security invoker set search_path=public as $$
begin
  if not exists(select 1 from public.client_reschedule_requests where id=p_request_id) and exists(
    select 1 from public.orders where id=p_order_id and client_id=any(p_client_ids) and videographer_id is not null and videographer_id is distinct from photographer_id
  ) then raise exception 'crew_reschedule_requires_office'; end if;
  return public.commit_client_reschedule_single_crew(p_request_id,p_order_id,p_client_ids,p_previous,p_scheduled_at,p_photographer_id,p_duration);
end;$$;
revoke all on function public.commit_client_reschedule(uuid,uuid,uuid[],timestamptz,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.commit_client_reschedule(uuid,uuid,uuid[],timestamptz,timestamptz,uuid,integer) to service_role;

create or replace function public.advance_photographer_assignment(p_order uuid,p_round integer,p_member uuid default null)
returns boolean language plpgsql security invoker set search_path=public as $$
declare o public.orders; c public.contractors; ids uuid[]; z text; timeout_minutes integer;
begin
  select * into o from public.orders where id=p_order for update;
  if not found or not o.auto_dispatch or o.assignment_round<>p_round or o.archived_at is not null or o.status not in ('booked','scheduled')
    or not (o.assignment_state='rerouting' or (o.assignment_state='awaiting_response' and o.assignment_due_at<=now())) then return false; end if;
  if p_member is not null then
    if p_member=any(o.assignment_attempted_ids) or o.scheduled_at<=now() then raise exception 'candidate_unavailable'; end if;
    select array_agg(product_id) filter(where product_id is not null) into ids from public.order_items where order_id=o.id;
    select zip into z from public.listings where id=o.listing_id;
    perform public.assert_routing_slot(p_member,o.scheduled_at,o.duration_minutes,ids,z,o.id);
    select * into c from public.contractors where team_member_id=p_member and is_active order by id limit 1;
  end if;
  select assignment_timeout_minutes into timeout_minutes from public.business_settings where id=true;
  update public.orders set videographer_id=case when o.videographer_id=o.photographer_id then p_member else o.videographer_id end,photographer_id=p_member,contractor_id=c.id,pay_amount_cents=coalesce(c.pay_rate_cents,0),
    contractor_response=null,contractor_responded_at=null,contractor_response_note=null,
    assignment_round=o.assignment_round+1,assignment_attempted_ids=case when p_member is null then o.assignment_attempted_ids else array_append(o.assignment_attempted_ids,p_member) end,
    assignment_state=case when p_member is null then 'needs_attention' when c.id is not null then 'awaiting_response' else 'confirmed' end,
    assignment_due_at=case when c.id is not null then least(o.scheduled_at,now()+make_interval(mins=>timeout_minutes)) else null end,
    updated_at=now() where id=p_order;
  return true;
end;$$;
commit;
