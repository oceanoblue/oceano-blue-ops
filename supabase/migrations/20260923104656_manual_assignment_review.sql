begin;
alter table public.orders
 add column photographer_start_offset_minutes integer not null default 0,
 add column photographer_duration_minutes integer,
 add column videographer_start_offset_minutes integer not null default 0,
 add column videographer_duration_minutes integer,
 add constraint crew_windows_inside_appointment check (
 photographer_start_offset_minutes>=0 and videographer_start_offset_minutes>=0 and
 (photographer_duration_minutes is null or photographer_duration_minutes between 15 and 720) and
 (videographer_duration_minutes is null or videographer_duration_minutes between 15 and 720) and
 photographer_start_offset_minutes+coalesce(photographer_duration_minutes,duration_minutes)<=duration_minutes and
 videographer_start_offset_minutes+coalesce(videographer_duration_minutes,duration_minutes)<=duration_minutes);
alter table public.order_calendar_events add constraint order_calendar_events_order_calendar_role_key unique(order_id,calendar_id,role);
create function public.crew_windows(o public.orders) returns table(member uuid,starts_at timestamptz,ends_at timestamptz)
language sql stable set search_path=public as $$
 select coalesce(o.photographer_id,(select team_member_id from contractors where id=o.contractor_id)),o.scheduled_at+make_interval(mins=>o.photographer_start_offset_minutes),o.scheduled_at+make_interval(mins=>o.photographer_start_offset_minutes+coalesce(o.photographer_duration_minutes,o.duration_minutes,60))
 union all select o.videographer_id,o.scheduled_at+make_interval(mins=>o.videographer_start_offset_minutes),o.scheduled_at+make_interval(mins=>o.videographer_start_offset_minutes+coalesce(o.videographer_duration_minutes,o.duration_minutes,60));
$$;
create or replace function public.prepare_assignment_state() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if not (select scheduling_dispatch_enabled from public.business_settings where id=true) then return new; end if;
  -- A date or photographer change invalidates an earlier response and its link.
  if new.assignment_round=old.assignment_round and (new.photographer_id is distinct from old.photographer_id or new.contractor_id is distinct from old.contractor_id or new.scheduled_at is distinct from old.scheduled_at or new.photographer_start_offset_minutes is distinct from old.photographer_start_offset_minutes or new.photographer_duration_minutes is distinct from old.photographer_duration_minutes or coalesce(new.photographer_duration_minutes,new.duration_minutes,60) is distinct from coalesce(old.photographer_duration_minutes,old.duration_minutes,60) or (old.contractor_response is not null and new.contractor_response is null)) then
    new.assignment_round:=old.assignment_round+1;
    new.contractor_response:=null; new.contractor_responded_at:=null; new.contractor_response_note:=null;
    new.assignment_state:=case when new.photographer_id is null and new.contractor_id is null then 'needs_attention' when new.contractor_id is not null then 'awaiting_response' else 'confirmed' end;
    new.assignment_due_at:=case when new.contractor_id is not null then least(new.scheduled_at,now()+make_interval(mins=>case when new.auto_dispatch then (select assignment_timeout_minutes from public.business_settings where id=true) else greatest(1440,(select assignment_timeout_minutes from public.business_settings where id=true)) end)) else null end;
    if new.photographer_id is distinct from old.photographer_id or new.contractor_id is distinct from old.contractor_id then
      new.auto_dispatch:=false; -- office reassignment always takes ownership
    end if;
    new.assignment_attempted_ids:=case when new.photographer_id is null then '{}'::uuid[] else array[new.photographer_id] end;
  elsif new.contractor_response is distinct from old.contractor_response and new.contractor_response is not null and old.assignment_round>0 then
    if old.scheduled_at<=now() or old.status not in ('booked','scheduled') or not (old.assignment_state='awaiting_response' or (old.assignment_state='needs_attention' and not old.auto_dispatch and old.contractor_response is null and old.scheduled_at>now()) or (old.assignment_state='confirmed' and (new.contractor_response='declined' or old.assignment_confirmation_mode='automatic') and new.scheduled_at>now()))
      or (old.assignment_state='awaiting_response' and old.assignment_due_at<=now() and old.auto_dispatch) then raise exception 'assignment_expired'; end if;
    new.assignment_state:=case when new.contractor_response='accepted' then 'confirmed' when new.auto_dispatch then 'rerouting' else 'needs_attention' end;
    new.assignment_due_at:=null;
  end if;
  -- Snapshot the policy only for a new assignment version. Changing the setting
  -- never rewrites an existing reservation, deadline, response or notification.
  if new.assignment_round<>old.assignment_round then
    new.assignment_confirmation_mode:=case when coalesce(current_setting('app.renew_assignment',true),'')='on' then 'manual' when (select auto_confirm_bookings from public.business_settings where id=true) then 'automatic' else 'manual' end;
    if new.scheduled_at is not null and (new.photographer_id is not null or new.contractor_id is not null) then
      new.assignment_state:=case when new.assignment_confirmation_mode='automatic' then 'confirmed' else 'awaiting_response' end;
      new.assignment_due_at:=case when new.assignment_confirmation_mode='manual' then least(new.scheduled_at,now()+make_interval(mins=>case when new.auto_dispatch then (select assignment_timeout_minutes from public.business_settings where id=true) else greatest(1440,(select assignment_timeout_minutes from public.business_settings where id=true)) end)) else null end;
    else
      new.assignment_state:='needs_attention'; new.assignment_due_at:=null;
    end if;
  end if;
  if new.auto_dispatch and not old.auto_dispatch and new.assignment_state='awaiting_response' then
    new.assignment_due_at:=least(new.scheduled_at,now()+make_interval(mins=>(select assignment_timeout_minutes from public.business_settings where id=true)));
  end if;
  return new;
end;$$;
revoke all on function public.prepare_assignment_state() from public,anon,authenticated;

create or replace function public.respond_to_team_assignment(p_order uuid,p_round integer,p_member uuid,p_response text)
returns boolean language plpgsql security invoker set search_path=public as $$
declare o public.orders;
begin
  if p_response not in ('accepted','declined') then raise exception 'invalid_response'; end if;
  if not exists(select 1 from public.team_members where id=p_member and is_active and role in ('admin','photographer')) then return false; end if;
  select * into o from public.orders where id=p_order for update;
  if not found or o.photographer_id is distinct from p_member or o.contractor_id is not null or o.assignment_round<>p_round
    or o.archived_at is not null or o.status not in ('booked','scheduled') or o.scheduled_at<=now()
    or not (o.assignment_state='awaiting_response' and (o.assignment_due_at>now() or not o.auto_dispatch) or (o.assignment_state='needs_attention' and not o.auto_dispatch and not exists(select 1 from public.assignment_dispatch_events e where e.order_id=o.id and e.round=o.assignment_round and e.event in ('accepted_by_photographer','declined_by_photographer'))) or o.assignment_state='confirmed' and p_response='declined') then return false; end if;
  update public.orders set assignment_state=case when p_response='accepted' then 'confirmed' when auto_dispatch then 'rerouting' else 'needs_attention' end,
    assignment_due_at=null,updated_at=now() where id=p_order;
  insert into public.assignment_dispatch_events(order_id,round,team_member_id,event) values(p_order,p_round,p_member,p_response||'_by_photographer');
  return true;
end;$$;
revoke all on function public.respond_to_team_assignment(uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.respond_to_team_assignment(uuid,integer,uuid,text) to service_role;

create function public.renew_order_assignment(p_order uuid,p_round integer,p_expected_updated_at timestamptz,p_availability_note text default '')
returns integer language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
  if not coalesce(public.is_team_member(),false) then raise exception 'forbidden'; end if;
  select * into o from public.orders where id=p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.assignment_round=p_round+1 and o.assignment_state='awaiting_response' and not o.auto_dispatch then return o.assignment_round; end if;
  if o.assignment_round<>p_round or o.updated_at is distinct from p_expected_updated_at then raise exception 'order_changed'; end if;
  if o.archived_at is not null or o.status not in ('booked','scheduled') or o.scheduled_at<=now() or o.scheduled_at is null
    or (o.photographer_id is null and o.contractor_id is null) or o.contractor_response is not null or o.assignment_state<>'needs_attention' then raise exception 'assignment_not_renewable'; end if;
  perform set_config('app.renew_assignment','on',true);
  update public.orders set assignment_round=assignment_round+1,auto_dispatch=false,assignment_state='awaiting_response',
    assignment_confirmation_mode='manual',assignment_due_at=least(scheduled_at,now()+interval '24 hours'),updated_at=now() where id=p_order;
  perform set_config('app.renew_assignment','off',true);
  update public.booking_followups set payload=payload||jsonb_build_object('availability_note',left(p_availability_note,2000))
    where order_id=p_order and event_key='assignment-'||(p_round+1)::text and kind in ('assignment_email','assignment_sms');
  return p_round+1;
end;$$;
revoke all on function public.renew_order_assignment(uuid,integer,timestamptz,text) from public,anon;
grant execute on function public.renew_order_assignment(uuid,integer,timestamptz,text) to authenticated;

-- Enforce hours for changes through any staff entry point, with an explicit office override.
create function public.check_crew_working_hours() returns trigger language plpgsql security definer set search_path=public as $$
declare w record;
begin
  if new.scheduled_at is null or new.scheduled_at<=now() or new.archived_at is not null or new.status in ('cancelled','draft','delivered') then return new; end if;
  if tg_op='UPDATE' and new.scheduled_at is not distinct from old.scheduled_at and new.duration_minutes is not distinct from old.duration_minutes
    and new.photographer_start_offset_minutes is not distinct from old.photographer_start_offset_minutes and new.photographer_duration_minutes is not distinct from old.photographer_duration_minutes and new.videographer_start_offset_minutes is not distinct from old.videographer_start_offset_minutes and new.videographer_duration_minutes is not distinct from old.videographer_duration_minutes and new.photographer_id is not distinct from old.photographer_id and new.contractor_id is not distinct from old.contractor_id and new.videographer_id is not distinct from old.videographer_id then return new; end if;
  if coalesce(current_setting('app.allow_double_book',true),'')='on' then return new; end if;
  for w in select * from public.crew_windows(new) where member is not null loop
    if not exists(select 1 from public.team_availability a where a.team_member_id=w.member and a.is_active
      and a.day_of_week=extract(dow from w.starts_at at time zone a.timezone)
      and w.starts_at>=(((w.starts_at at time zone a.timezone)::date+a.start_local) at time zone a.timezone)
      and w.ends_at<=(((w.starts_at at time zone a.timezone)::date+a.end_local) at time zone a.timezone))
    then raise exception 'slot_unavailable: appointment is outside a crew member working hours' using errcode='23P01'; end if;
  end loop;
  return new;
end;$$;
revoke all on function public.check_crew_working_hours() from public,anon,authenticated;
create trigger check_crew_working_hours before insert or update on public.orders for each row execute function public.check_crew_working_hours();

create or replace function public.check_order_no_double_book() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_member uuid; v_ids uuid[]; v_buffer int; v_conflict uuid; v_video_changed boolean; v_photo_changed boolean; w record;
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
    and new.photographer_start_offset_minutes is not distinct from old.photographer_start_offset_minutes and new.photographer_duration_minutes is not distinct from old.photographer_duration_minutes and new.videographer_start_offset_minutes is not distinct from old.videographer_start_offset_minutes and new.videographer_duration_minutes is not distinct from old.videographer_duration_minutes and new.status is not distinct from old.status then return new; end if;
  select array_agg(distinct id order by id) into v_ids from unnest(array[
    coalesce(new.photographer_id,(select team_member_id from public.contractors where id=new.contractor_id)),new.videographer_id]) id where id is not null;
  select coalesce(buffer_minutes,30) into v_buffer from public.business_settings where id=true;
  foreach v_member in array coalesce(v_ids,'{}'::uuid[]) loop
    perform pg_advisory_xact_lock(hashtext(v_member::text)::bigint);
  end loop;
  for w in select * from public.crew_windows(new) where member is not null loop
    select o.id into v_conflict from public.orders o cross join lateral public.crew_windows(o) other
    where o.id<>new.id and o.status not in ('cancelled','draft') and other.member=w.member
      and w.starts_at-make_interval(mins=>coalesce(v_buffer,30))<other.ends_at
      and w.ends_at+make_interval(mins=>coalesce(v_buffer,30))>other.starts_at limit 1;
    if found then raise exception 'slot_unavailable: a crew member has another shoot or travel conflict (%)',v_conflict using errcode='23P01'; end if;
  end loop;
  return new;
end;$$;

drop function public.set_order_crew(uuid,uuid,uuid,uuid,timestamptz,boolean);
create function public.set_order_crew(p_order uuid,p_photographer uuid,p_contractor uuid,p_videographer uuid,p_expected_updated_at timestamptz,p_allow_overlap boolean default false,p_photo_offset integer default 0,p_photo_duration integer default null,p_video_offset integer default 0,p_video_duration integer default null)
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
  if o.photographer_id is not distinct from v_photo and o.contractor_id is not distinct from p_contractor and o.videographer_id is not distinct from p_videographer and o.photographer_start_offset_minutes=p_photo_offset and o.photographer_duration_minutes is not distinct from p_photo_duration and o.videographer_start_offset_minutes=p_video_offset and o.videographer_duration_minutes is not distinct from p_video_duration then return; end if;
  if o.updated_at is distinct from p_expected_updated_at then raise exception 'order_changed'; end if;
  perform set_config('app.allow_double_book',case when p_allow_overlap then 'on' else 'off' end,true);
  update public.orders set photographer_id=v_photo,contractor_id=p_contractor,videographer_id=p_videographer,pay_amount_cents=v_rate,
    photographer_start_offset_minutes=p_photo_offset,photographer_duration_minutes=p_photo_duration,videographer_start_offset_minutes=p_video_offset,videographer_duration_minutes=p_video_duration,auto_dispatch=false,updated_at=now() where id=p_order;
  perform set_config('app.allow_double_book','off',true);
end;$$;
revoke all on function public.set_order_crew(uuid,uuid,uuid,uuid,timestamptz,boolean,integer,integer,integer,integer) from public,anon;
grant execute on function public.set_order_crew(uuid,uuid,uuid,uuid,timestamptz,boolean,integer,integer,integer,integer) to authenticated;

create or replace function public.queue_video_calendar_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (new.videographer_start_offset_minutes is distinct from old.videographer_start_offset_minutes or new.videographer_duration_minutes is distinct from old.videographer_duration_minutes or new.videographer_id is distinct from old.videographer_id or new.photographer_id is distinct from old.photographer_id or new.contractor_id is distinct from old.contractor_id) and new.scheduled_at>now()
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
  if exists(select 1 from public.orders o left join public.contractors c on c.id=o.contractor_id left join public.listings l on l.id=o.listing_id cross join lateral public.crew_windows(o) cw
    where cw.member=p_member and o.id is distinct from p_order and o.status not in ('cancelled','draft')
    and p_at < cw.ends_at+make_interval(mins=>greatest(v_buffer,case when left(coalesce(l.zip,''),5)<>left(coalesce(p_zip,''),5) then r.cross_zip_minutes else 0 end))
    and p_at+make_interval(mins=>p_duration+greatest(v_buffer,case when left(coalesce(l.zip,''),5)<>left(coalesce(p_zip,''),5) then r.cross_zip_minutes else 0 end))>cw.starts_at) then
    raise exception 'slot_unavailable: travel conflict' using errcode='23P01';
  end if;
end;$$;


commit;
