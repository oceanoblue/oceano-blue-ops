begin;
create or replace function public.prepare_assignment_state() returns trigger language plpgsql security invoker set search_path=public as $$
declare keep_acceptance boolean;
begin
  if not (select scheduling_dispatch_enabled from public.business_settings where id=true) then return new; end if;
  -- A shorter visit with the same arrival and photographer is already covered
  -- by the recorded acceptance. Preserve its version, response and timestamp.
  keep_acceptance := old.assignment_state='confirmed'
    and old.status in ('booked','scheduled') and old.scheduled_at>now()
    and (old.contractor_response='accepted' or (old.contractor_id is null and old.assignment_confirmation_mode='manual'))
    and new.photographer_id is not distinct from old.photographer_id
    and new.contractor_id is not distinct from old.contractor_id
    and new.contractor_response is not distinct from old.contractor_response
    and new.scheduled_at is not distinct from old.scheduled_at
    and new.photographer_start_offset_minutes=old.photographer_start_offset_minutes
    and coalesce(new.photographer_duration_minutes,new.duration_minutes,60)<coalesce(old.photographer_duration_minutes,old.duration_minutes,60);
  -- Changing arrival, extending a visit, or replacing the photographer still
  -- invalidates an earlier response and its link.
  if new.assignment_round=old.assignment_round and not coalesce(keep_acceptance,false) and (new.photographer_id is distinct from old.photographer_id or new.contractor_id is distinct from old.contractor_id or new.scheduled_at is distinct from old.scheduled_at or new.photographer_start_offset_minutes is distinct from old.photographer_start_offset_minutes or coalesce(new.photographer_duration_minutes,new.duration_minutes,60) is distinct from coalesce(old.photographer_duration_minutes,old.duration_minutes,60) or (old.contractor_response is not null and new.contractor_response is null)) then
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

-- Shortening must still update the calendar when no new request is queued.
create or replace function public.queue_video_calendar_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (new.duration_minutes is distinct from old.duration_minutes or new.photographer_start_offset_minutes is distinct from old.photographer_start_offset_minutes or coalesce(new.photographer_duration_minutes,new.duration_minutes,60) is distinct from coalesce(old.photographer_duration_minutes,old.duration_minutes,60) or new.videographer_start_offset_minutes is distinct from old.videographer_start_offset_minutes or new.videographer_duration_minutes is distinct from old.videographer_duration_minutes or new.videographer_id is distinct from old.videographer_id or new.photographer_id is distinct from old.photographer_id or new.contractor_id is distinct from old.contractor_id) and new.scheduled_at>now()
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
commit;
