-- Apply after the application release: internal assignment links require the new response page.
begin;
create or replace function public.prepare_assignment_state() returns trigger language plpgsql security invoker set search_path=public as $$
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
    if not (old.assignment_state='awaiting_response' or (old.assignment_state='confirmed' and (new.contractor_response='declined' or old.assignment_confirmation_mode='automatic') and new.scheduled_at>now()))
      or (old.assignment_state='awaiting_response' and old.assignment_due_at<=now()) then raise exception 'assignment_expired'; end if;
    new.assignment_state:=case when new.contractor_response='accepted' then 'confirmed' when new.auto_dispatch then 'rerouting' else 'needs_attention' end;
    new.assignment_due_at:=null;
  end if;
  -- Snapshot the policy only for a new assignment version. Changing the setting
  -- never rewrites an existing reservation, deadline, response or notification.
  if new.assignment_round<>old.assignment_round then
    new.assignment_confirmation_mode:=case when (select auto_confirm_bookings from public.business_settings where id=true) then 'automatic' else 'manual' end;
    if new.scheduled_at is not null and (new.photographer_id is not null or new.contractor_id is not null) then
      new.assignment_state:=case when new.assignment_confirmation_mode='automatic' then 'confirmed' else 'awaiting_response' end;
      new.assignment_due_at:=case when new.assignment_confirmation_mode='manual' then least(new.scheduled_at,now()+make_interval(mins=>(select assignment_timeout_minutes from public.business_settings where id=true))) else null end;
    else
      new.assignment_state:='needs_attention'; new.assignment_due_at:=null;
    end if;
  end if;
  return new;
end;$$;
revoke all on function public.prepare_assignment_state() from public,anon,authenticated;

create or replace function public.queue_assignment_events() returns trigger language plpgsql security definer set search_path=public as $$
declare p jsonb; k text; c public.contractors; t public.team_members;
begin
  if not (select scheduling_dispatch_enabled from public.business_settings where id=true) then return new; end if;
  if new.assignment_round=0 or new.scheduled_at is null or new.archived_at is not null or new.status in ('draft','cancelled','delivered') then return new; end if;
  if new.assignment_round=old.assignment_round and new.assignment_state=old.assignment_state then return new; end if;
  select jsonb_build_object('client_name',cl.full_name,'client_email',cl.email,'client_phone',cl.phone,'address_line1',l.address_line1,'city',l.city,'state',l.state,'zip',l.zip,
    'scheduled_at',new.scheduled_at,'timezone',new.timezone,'assignment_round',new.assignment_round,'contractor_id',new.contractor_id,'photographer_id',new.photographer_id,'assignment_due_at',new.assignment_due_at,'automatically_confirmed',new.assignment_confirmation_mode='automatic')
    into p from public.clients cl join public.listings l on l.id=new.listing_id where cl.id=new.client_id;
  p:=coalesce(p,'{}'::jsonb); k:='assignment-'||new.assignment_round;
  insert into public.assignment_dispatch_events(order_id,round,team_member_id,event) values(new.id,new.assignment_round,new.photographer_id,new.assignment_state);
  if new.assignment_round<>old.assignment_round then
    if not (old.assignment_round=0 and new.auto_dispatch) then
      insert into public.booking_followups(order_id,kind,recipient,payload,event_key) values(new.id,'calendar','',p,k) on conflict do nothing;
    end if;
    if new.assignment_state='awaiting_response' or (new.assignment_state='confirmed' and new.assignment_confirmation_mode='automatic') then
      select * into c from public.contractors where id=new.contractor_id and is_active;
      if new.contractor_id is null then
        select * into t from public.team_members where id=new.photographer_id and is_active;
        c.email:=t.email; c.phone:=t.phone;
      end if;
      if coalesce(c.email,'')<>'' then insert into public.booking_followups(order_id,kind,recipient,payload,event_key) values(new.id,'assignment_email',c.email,p,k) on conflict do nothing; end if;
      if coalesce(c.phone,'')<>'' then insert into public.booking_followups(order_id,kind,recipient,payload,event_key) values(new.id,'assignment_sms',c.phone,p,k) on conflict do nothing; end if;
    end if;
  end if;
  if new.assignment_round=old.assignment_round and new.contractor_id is null and new.assignment_state<>old.assignment_state then
    insert into public.booking_followups(order_id,kind,recipient,payload,event_key) values(new.id,'calendar','',p,k||'-'||new.assignment_state) on conflict do nothing;
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

create or replace function public.commit_public_booking(p_payload jsonb,p_request_id uuid,p_request_hash text)
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
    -- The core may already have opened a contractor assignment version. Preserve
    -- that policy; the BEFORE trigger initializes internal assignments at round 1.
    assignment_state=case when assignment_round>0 then assignment_state else 'awaiting_response' end,
    assignment_due_at=case when assignment_round>0 then assignment_due_at else least(scheduled_at,now()+make_interval(mins=>v_timeout)) end
    where id=v_order;
  update public.booking_followups f set payload=f.payload||jsonb_build_object('event','assignment_pending','assignment_round',1)
    from public.orders o where f.order_id=v_order and o.id=v_order and o.assignment_state='awaiting_response' and f.kind='client_email' and f.event_key='booking';
  return v_order;
end;$$;
revoke all on function public.commit_public_booking(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.commit_public_booking(jsonb,uuid,text) to service_role;


-- Called only by the authenticated server route, which supplies the verified user.
create function public.respond_to_team_assignment(p_order uuid,p_round integer,p_member uuid,p_response text)
returns boolean language plpgsql security invoker set search_path=public as $$
declare o public.orders;
begin
  if p_response not in ('accepted','declined') then raise exception 'invalid_response'; end if;
  if not exists(select 1 from public.team_members where id=p_member and is_active and role in ('admin','photographer')) then return false; end if;
  select * into o from public.orders where id=p_order for update;
  if not found or o.photographer_id is distinct from p_member or o.contractor_id is not null or o.assignment_round<>p_round
    or o.archived_at is not null or o.status not in ('booked','scheduled') or o.scheduled_at<=now()
    or not (o.assignment_state='awaiting_response' and o.assignment_due_at>now() or o.assignment_state='confirmed' and p_response='declined') then return false; end if;
  update public.orders set assignment_state=case when p_response='accepted' then 'confirmed' when auto_dispatch then 'rerouting' else 'needs_attention' end,
    assignment_due_at=null,updated_at=now() where id=p_order;
  insert into public.assignment_dispatch_events(order_id,round,team_member_id,event) values(p_order,p_round,p_member,p_response||'_by_photographer');
  return true;
end;$$;
revoke all on function public.respond_to_team_assignment(uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.respond_to_team_assignment(uuid,integer,uuid,text) to service_role;
commit;
