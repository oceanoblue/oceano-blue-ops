-- Preserve schedule validation for new/changed reservations; allow delivery finalization.
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
  -- An existing reservation keeps the same occupied time when only its production
  -- status changes. Do not revalidate approved overlaps while finishing delivery.
  -- Draft/cancelled reactivation still needs a full conflict check.
  if tg_op='UPDATE' and not v_video_changed and not v_photo_changed
    and new.contractor_id is not distinct from old.contractor_id
    and new.scheduled_at is not distinct from old.scheduled_at
    and new.duration_minutes is not distinct from old.duration_minutes
    and new.photographer_start_offset_minutes is not distinct from old.photographer_start_offset_minutes and new.photographer_duration_minutes is not distinct from old.photographer_duration_minutes and new.videographer_start_offset_minutes is not distinct from old.videographer_start_offset_minutes and new.videographer_duration_minutes is not distinct from old.videographer_duration_minutes and old.status not in ('cancelled','draft') then return new; end if;
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
