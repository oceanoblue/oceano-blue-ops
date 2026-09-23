begin;
-- Apply after the crew-window application release, which upserts by role.
alter table public.order_calendar_events drop constraint order_calendar_events_order_id_calendar_id_key;

-- Explicitly saving an unchanged legacy duration must not request acceptance again.
create or replace function public.prepare_assignment_state() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if not (select scheduling_dispatch_enabled from public.business_settings where id=true) then return new; end if;
  -- A date or photographer change invalidates an earlier response and its link.
  if new.assignment_round=old.assignment_round and (new.photographer_id is distinct from old.photographer_id or new.contractor_id is distinct from old.contractor_id or new.scheduled_at is distinct from old.scheduled_at or new.photographer_start_offset_minutes is distinct from old.photographer_start_offset_minutes or coalesce(new.photographer_duration_minutes,new.duration_minutes,60) is distinct from coalesce(old.photographer_duration_minutes,old.duration_minutes,60) or (old.contractor_response is not null and new.contractor_response is null)) then
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
commit;
