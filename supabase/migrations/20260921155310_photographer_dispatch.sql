begin;
alter table public.business_settings
  add column scheduling_dispatch_enabled boolean not null default false,
  add column assignment_timeout_minutes integer not null default 60 check (assignment_timeout_minutes between 15 and 1440);

create table public.photographer_routing (
  team_member_id uuid primary key references public.team_members(id) on delete cascade,
  enabled boolean not null default false,
  priority integer not null default 100 check (priority between 1 and 1000),
  product_ids uuid[], -- NULL: all services; empty: no services
  service_zips text[] not null default '{}', -- empty: unrestricted
  travel_minutes integer not null default 30 check (travel_minutes between 0 and 240),
  cross_zip_minutes integer not null default 45 check (cross_zip_minutes between 0 and 240),
  color text not null default '#0369a1' check (color ~ '^#[0-9a-fA-F]{6}$')
);
alter table public.photographer_routing enable row level security;
revoke all on public.photographer_routing from public,anon,authenticated;
grant select on public.photographer_routing to authenticated;
grant all on public.photographer_routing to service_role;
create policy "staff read routing" on public.photographer_routing for select to authenticated using(public.is_team_member());

-- Conservative initial qualifications: only standard photography for contractors.
-- The office explicitly enables additional services after confirming skills.
insert into public.photographer_routing(team_member_id,enabled,priority,product_ids,color)
select t.id,true,case when t.role='admin' then 100 else 10 end,
  case when t.role='admin' then null else array(select p.id from public.products p where p.is_active and lower(p.name)='interior/exterior photography') end,
  case when t.role='admin' then '#0369a1' else '#7c3aed' end
from public.team_members t where t.is_active and t.role in ('admin','photographer');

alter table public.orders
  add column assignment_state text not null default 'confirmed' check (assignment_state in ('confirmed','awaiting_response','rerouting','needs_attention')),
  add column assignment_due_at timestamptz,
  add column assignment_round integer not null default 0,
  add column auto_dispatch boolean not null default false,
  add column assignment_attempted_ids uuid[] not null default '{}';
create index orders_dispatch_pending_idx on public.orders(assignment_due_at) where auto_dispatch and assignment_state in ('awaiting_response','rerouting');

-- Reconcile linked legacy records without changing who was assigned or sending messages.
update public.orders o set photographer_id=c.team_member_id
from public.contractors c where o.contractor_id=c.id and o.photographer_id is null and c.team_member_id is not null;
update public.orders set assignment_state=case when contractor_response='declined' then 'needs_attention' else 'confirmed' end;

create table public.assignment_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  round integer not null,
  team_member_id uuid references public.team_members(id),
  event text not null,
  created_at timestamptz not null default now()
);
alter table public.assignment_dispatch_events enable row level security;
revoke all on public.assignment_dispatch_events from public,anon,authenticated;
grant select on public.assignment_dispatch_events to authenticated;
grant all on public.assignment_dispatch_events to service_role;
create policy "staff read dispatch history" on public.assignment_dispatch_events for select to authenticated using(public.is_team_member());
create index assignment_dispatch_events_order_idx on public.assignment_dispatch_events(order_id);

alter table public.booking_followups drop constraint booking_followups_kind_check;
alter table public.booking_followups add constraint booking_followups_kind_check check(kind in ('calendar','client_email','office_email','office_sms','assignment_email','assignment_sms','office_attention'));

-- Must run under the same per-photographer lock as the actual assignment write.
create function public.assert_routing_slot(p_member uuid,p_at timestamptz,p_duration integer,p_products uuid[],p_zip text,p_order uuid default null)
returns void language plpgsql security invoker set search_path=public as $$
declare r public.photographer_routing; v_buffer int;
begin
  perform pg_advisory_xact_lock(hashtext(p_member::text)::bigint);
  select * into r from public.photographer_routing where team_member_id=p_member;
  if not found or not r.enabled or not exists(select 1 from public.team_members where id=p_member and is_active and role in ('admin','photographer'))
    or (r.product_ids is not null and (coalesce(cardinality(p_products),0)=0 or not p_products <@ r.product_ids))
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
    where coalesce(c.team_member_id,o.photographer_id)=p_member and o.id is distinct from p_order and o.status not in ('cancelled','draft')
    and p_at < o.scheduled_at+make_interval(mins=>coalesce(o.duration_minutes,60)+greatest(v_buffer,case when left(coalesce(l.zip,''),5)<>left(coalesce(p_zip,''),5) then r.cross_zip_minutes else 0 end))
    and p_at+make_interval(mins=>p_duration+greatest(v_buffer,case when left(coalesce(l.zip,''),5)<>left(coalesce(p_zip,''),5) then r.cross_zip_minutes else 0 end))>o.scheduled_at) then
    raise exception 'slot_unavailable: travel conflict' using errcode='23P01';
  end if;
end;$$;
revoke all on function public.assert_routing_slot(uuid,timestamptz,integer,uuid[],text,uuid) from public,anon,authenticated;
grant execute on function public.assert_routing_slot(uuid,timestamptz,integer,uuid[],text,uuid) to service_role;

create function public.prepare_assignment_state() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if not (select scheduling_dispatch_enabled from public.business_settings where id=true) then return new; end if;
  -- A date or photographer change invalidates an earlier response and its link.
  if new.assignment_round=old.assignment_round and (new.photographer_id is distinct from old.photographer_id or new.contractor_id is distinct from old.contractor_id or new.scheduled_at is distinct from old.scheduled_at or (old.contractor_response is not null and new.contractor_response is null)) then
    new.assignment_round:=old.assignment_round+1;
    new.contractor_response:=null; new.contractor_responded_at:=null; new.contractor_response_note:=null;
    new.assignment_state:=case when new.photographer_id is null and new.contractor_id is null then 'needs_attention' when new.contractor_id is not null then 'awaiting_response' else 'confirmed' end;
    new.assignment_due_at:=case when new.contractor_id is not null then least(new.scheduled_at,now()+make_interval(mins=>(select assignment_timeout_minutes from public.business_settings where id=true))) else null end;
    if new.photographer_id is distinct from old.photographer_id or new.contractor_id is distinct from old.contractor_id then
      new.auto_dispatch:=false; -- office reassignment always takes ownership
    end if;
    new.assignment_attempted_ids:=case when new.photographer_id is null then '{}'::uuid[] else array[new.photographer_id] end;
  elsif new.contractor_response is distinct from old.contractor_response and new.contractor_response is not null and old.assignment_round>0 then
    if not (old.assignment_state='awaiting_response' or (old.assignment_state='confirmed' and new.contractor_response='declined' and new.scheduled_at>now()))
      or (old.assignment_state='awaiting_response' and old.assignment_due_at<=now()) then raise exception 'assignment_expired'; end if;
    new.assignment_state:=case when new.contractor_response='accepted' then 'confirmed' when new.auto_dispatch then 'rerouting' else 'needs_attention' end;
    new.assignment_due_at:=null;
  end if;
  return new;
end;$$;
revoke all on function public.prepare_assignment_state() from public,anon,authenticated;
create trigger prepare_assignment_state before update on public.orders for each row execute function public.prepare_assignment_state();

-- Trigger writes use fixed trusted recipients, not client-supplied destinations.
create function public.queue_assignment_events() returns trigger language plpgsql security definer set search_path=public as $$
declare p jsonb; k text; c public.contractors;
begin
  if not (select scheduling_dispatch_enabled from public.business_settings where id=true) then return new; end if;
  if new.assignment_round=0 or new.scheduled_at is null or new.archived_at is not null or new.status in ('draft','cancelled','delivered') then return new; end if;
  if new.assignment_round=old.assignment_round and new.assignment_state=old.assignment_state then return new; end if;
  select jsonb_build_object('client_name',cl.full_name,'client_email',cl.email,'client_phone',cl.phone,'address_line1',l.address_line1,'city',l.city,'state',l.state,'zip',l.zip,
    'scheduled_at',new.scheduled_at,'timezone',new.timezone,'assignment_round',new.assignment_round,'contractor_id',new.contractor_id,'assignment_due_at',new.assignment_due_at)
    into p from public.clients cl join public.listings l on l.id=new.listing_id where cl.id=new.client_id;
  p:=coalesce(p,'{}'::jsonb); k:='assignment-'||new.assignment_round;
  insert into public.assignment_dispatch_events(order_id,round,team_member_id,event) values(new.id,new.assignment_round,new.photographer_id,new.assignment_state);
  if new.assignment_round<>old.assignment_round then
    if not (old.assignment_round=0 and new.auto_dispatch) then
      insert into public.booking_followups(order_id,kind,recipient,payload,event_key) values(new.id,'calendar','',p,k) on conflict do nothing;
    end if;
    if new.assignment_state='awaiting_response' then
      select * into c from public.contractors where id=new.contractor_id and is_active;
      if coalesce(c.email,'')<>'' then insert into public.booking_followups(order_id,kind,recipient,payload,event_key) values(new.id,'assignment_email',c.email,p,k) on conflict do nothing; end if;
      if coalesce(c.phone,'')<>'' then insert into public.booking_followups(order_id,kind,recipient,payload,event_key) values(new.id,'assignment_sms',c.phone,p,k) on conflict do nothing; end if;
    end if;
  end if;
  if new.assignment_state='confirmed' and old.assignment_state<>'confirmed' and exists(select 1 from public.booking_requests where order_id=new.id) then
    if coalesce(p->>'client_email','')<>'' then insert into public.booking_followups(order_id,kind,recipient,payload,event_key) values(new.id,'client_email',p->>'client_email',p||'{"event":"assignment_confirmed"}'::jsonb,k||'-confirmed') on conflict do nothing; end if;
  end if;
  if new.assignment_state in ('needs_attention','rerouting') or (new.assignment_round>1 and new.assignment_state='confirmed' and new.auto_dispatch) then
    insert into public.booking_followups(order_id,kind,recipient,payload,event_key)
      select new.id,'office_attention',email,p||jsonb_build_object('assignment_state',new.assignment_state),k||'-office' from public.team_members where is_active and role='admin' and coalesce(email,'')<>'' on conflict do nothing;
  end if;
  return new;
end;$$;
revoke all on function public.queue_assignment_events() from public,anon,authenticated;
create trigger queue_assignment_events after update on public.orders for each row execute function public.queue_assignment_events();

alter function public.commit_public_booking(jsonb,uuid,text) rename to commit_public_booking_core;
create function public.commit_public_booking(p_payload jsonb,p_request_id uuid,p_request_hash text)
returns uuid language plpgsql security invoker set search_path=public as $$
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
  perform public.assert_routing_slot((p_payload->>'photographer_id')::uuid,(p_payload->>'scheduled_at')::timestamptz,v_duration,v_ids,p_payload->>'zip');
  v_order:=public.commit_public_booking_core(p_payload,p_request_id,p_request_hash);
  select assignment_timeout_minutes into v_timeout from public.business_settings where id=true;
  update public.orders set auto_dispatch=true,assignment_round=1,assignment_attempted_ids=array[photographer_id],
    assignment_state=case when contractor_id is not null then 'awaiting_response' else 'confirmed' end,
    assignment_due_at=case when contractor_id is not null then least(scheduled_at,now()+make_interval(mins=>v_timeout)) else null end
    where id=v_order;
  update public.booking_followups f set payload=f.payload||jsonb_build_object('event','assignment_pending','assignment_round',1)
    from public.orders o where f.order_id=v_order and o.id=v_order and o.assignment_state='awaiting_response' and f.kind='client_email' and f.event_key='booking';
  return v_order;
end;$$;
revoke all on function public.commit_public_booking(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.commit_public_booking(jsonb,uuid,text) to service_role;

create function public.advance_photographer_assignment(p_order uuid,p_round integer,p_member uuid default null)
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
  update public.orders set photographer_id=p_member,contractor_id=c.id,pay_amount_cents=coalesce(c.pay_rate_cents,0),
    contractor_response=null,contractor_responded_at=null,contractor_response_note=null,
    assignment_round=o.assignment_round+1,assignment_attempted_ids=case when p_member is null then o.assignment_attempted_ids else array_append(o.assignment_attempted_ids,p_member) end,
    assignment_state=case when p_member is null then 'needs_attention' when c.id is not null then 'awaiting_response' else 'confirmed' end,
    assignment_due_at=case when c.id is not null then least(o.scheduled_at,now()+make_interval(mins=>timeout_minutes)) else null end,
    updated_at=now() where id=p_order;
  return true;
end;$$;
revoke all on function public.advance_photographer_assignment(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.advance_photographer_assignment(uuid,integer,uuid) to service_role;

-- Preserve legacy portal responses during rollout, but never accept a versionless
-- response for a new or changed assignment. New routes enforce the exact round.
create or replace function public.respond_to_assignment(p_order_id uuid, p_response text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me    uuid;
  v_order public.orders%rowtype;
begin
  if p_response not in ('accepted','declined') then
    raise exception 'response must be accepted or declined, got %', p_response;
  end if;

  select c.id into v_me from public.contractors c
   where c.auth_user_id = auth.uid() and c.is_active limit 1;
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'no_contractor_for_this_login');
  end if;

  update public.orders o
     set contractor_response      = p_response,
         contractor_responded_at  = now(),
         contractor_response_note = nullif(btrim(coalesce(p_note,'')), ''),
         updated_at               = now()
   where o.id = p_order_id
     and o.assignment_round = 0
     and o.contractor_id = v_me
     and o.archived_at is null
     and o.status not in ('cancelled','draft')
  returning * into v_order;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_your_assignment');
  end if;

  insert into public.assignment_events (order_id, contractor_id, event, note)
  values (p_order_id, v_me, p_response, nullif(btrim(coalesce(p_note,'')), ''));

  return jsonb_build_object('ok', true, 'order_number', v_order.order_number,
                            'response', p_response, 'at', v_order.contractor_responded_at);
end
$function$;

revoke all on function respond_to_assignment(uuid, text, text) from public, anon;
grant execute on function respond_to_assignment(uuid, text, text) to authenticated;

alter function public.commit_client_reschedule(uuid,uuid,uuid[],timestamptz,timestamptz,uuid,integer) rename to commit_client_reschedule_core;
create function public.commit_client_reschedule(p_request_id uuid,p_order_id uuid,p_client_ids uuid[],p_previous timestamptz,p_scheduled_at timestamptz,p_photographer_id uuid,p_duration integer)
returns timestamptz language plpgsql security invoker set search_path=public as $$
declare o public.orders; ids uuid[]; z text; result timestamptz;
begin
  select * into o from public.orders where id=p_order_id and client_id=any(p_client_ids) for update;
  if not found then raise exception 'order_not_found'; end if;
  if exists(select 1 from public.client_reschedule_requests where id=p_request_id) then
    return public.commit_client_reschedule_core(p_request_id,p_order_id,p_client_ids,p_previous,p_scheduled_at,p_photographer_id,p_duration);
  end if;
  if (select scheduling_dispatch_enabled from public.business_settings where id=true) then
    if o.assignment_state<>'confirmed' then raise exception 'assignment_not_confirmed'; end if;
    select array_agg(product_id) filter(where product_id is not null) into ids from public.order_items where order_id=o.id;
    select zip into z from public.listings where id=o.listing_id;
    perform public.assert_routing_slot(p_photographer_id,p_scheduled_at,p_duration,ids,z,o.id);
  end if;
  result:=public.commit_client_reschedule_core(p_request_id,p_order_id,p_client_ids,p_previous,p_scheduled_at,p_photographer_id,p_duration);
  select * into o from public.orders where id=p_order_id;
  if o.assignment_round>0 then
    update public.booking_followups set payload=payload||jsonb_build_object('pending',o.assignment_state='awaiting_response','assignment_round',o.assignment_round)
      where order_id=o.id and event_key=p_request_id::text;
    -- The assignment trigger already queued the current calendar revision.
    delete from public.booking_followups where order_id=o.id and event_key=p_request_id::text and kind='calendar' and status='pending';
  end if;
  return result;
end;$$;
revoke all on function public.commit_client_reschedule(uuid,uuid,uuid[],timestamptz,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.commit_client_reschedule(uuid,uuid,uuid[],timestamptz,timestamptz,uuid,integer) to service_role;

-- Replace a weekly schedule atomically; API verifies staff ownership before calling.
create function public.replace_photographer_hours(p_member uuid,p_rows jsonb) returns void
language plpgsql security invoker set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_member::text)::bigint);
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>7 then raise exception 'invalid_hours'; end if;
  delete from public.team_availability where team_member_id=p_member;
  insert into public.team_availability(team_member_id,day_of_week,start_local,end_local,timezone,is_active)
    select p_member,(r->>'day_of_week')::int,(r->>'start_local')::time,(r->>'end_local')::time,r->>'timezone',true from jsonb_array_elements(p_rows) r;
end;$$;
revoke all on function public.replace_photographer_hours(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.replace_photographer_hours(uuid,jsonb) to service_role;

commit;
