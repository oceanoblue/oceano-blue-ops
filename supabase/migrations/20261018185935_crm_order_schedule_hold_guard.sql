-- Real estate and other staff-scheduled shoots must respect the same CRM
-- reservations as public availability. Keep the existing deliberate staff
-- overlap override and do not revalidate a reservation during delivery/billing.
-- Stale sync: blocks remain the live-calendar fallback handled by availability;
-- this guard is limited to the canonical CRM session reservation blocks.
create function public.check_order_crm_session_reservations() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare member_id uuid; member_ids uuid[]; buffer_minutes integer; visit record;
begin
 if coalesce(current_setting('app.allow_double_book',true),'')='on'
   or new.scheduled_at is null or new.status in ('cancelled','draft') then return new;end if;
 if tg_op='UPDATE' and old.status not in ('cancelled','draft')
   and new.photographer_id is not distinct from old.photographer_id
   and new.videographer_id is not distinct from old.videographer_id
   and new.contractor_id is not distinct from old.contractor_id
   and new.scheduled_at is not distinct from old.scheduled_at
   and new.duration_minutes is not distinct from old.duration_minutes
   and new.photographer_start_offset_minutes is not distinct from old.photographer_start_offset_minutes
   and new.photographer_duration_minutes is not distinct from old.photographer_duration_minutes
   and new.videographer_start_offset_minutes is not distinct from old.videographer_start_offset_minutes
   and new.videographer_duration_minutes is not distinct from old.videographer_duration_minutes then return new;end if;
 select coalesce(b.buffer_minutes,30) into buffer_minutes from public.business_settings b where b.id=true;
 select array_agg(distinct w.member order by w.member) into member_ids from public.crew_windows(new) w where w.member is not null;
 foreach member_id in array coalesce(member_ids,'{}'::uuid[]) loop
  -- Same owner lock as public booking, crew assignment and CRM session commit.
  perform pg_advisory_xact_lock(hashtext(member_id::text)::bigint);
 end loop;
 for visit in select * from public.crew_windows(new) where member is not null loop
  if exists(select 1 from public.schedule_blocks b where b.team_member_id=visit.member
    and not b.is_available and b.reason like 'crm-session:%'
    and visit.starts_at-make_interval(mins=>coalesce(buffer_minutes,30))<b.ends_at
    and visit.ends_at+make_interval(mins=>coalesce(buffer_minutes,30))>b.starts_at) then
   raise exception 'slot_unavailable: a crew member has a client session reservation' using errcode='23P01';
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.check_order_crm_session_reservations() from public,anon,authenticated;
create trigger order_crm_session_reservations before insert or update on public.orders
 for each row execute function public.check_order_crm_session_reservations();
