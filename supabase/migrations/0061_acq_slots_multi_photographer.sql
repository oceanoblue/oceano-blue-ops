-- 0061: Multi-photographer acq.available_slots (handoff seam 2).
--
-- Was: pick the single oldest active team member (order by created_at limit 1)
-- and only offer THEIR free times — so adding photographers changed nothing a
-- lead saw in the quote-booking flow. Now: offer a slot when ANY active
-- photographer is free (union across photographers), matching the platform's
-- /api/availability "at least one free" semantics. Same signature and same
-- buffer/notice/conflict rules; also restricts to admin/photographer roles
-- (the old limit-1 could land on a non-photographer team member).
create or replace function acq.available_slots(p_token text, p_days integer default 14)
  returns table(slot_start timestamptz, slot_end timestamptz)
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_quote    acq.quotes%rowtype;
  v_duration integer;
  v_buffer   integer;
  v_notice_h integer;
  v_max_days integer;
  v_from     timestamptz;
  v_to       timestamptz;
begin
  select * into v_quote from acq.quotes where public_token = p_token;
  if not found or v_quote.expires_at < now() then return; end if;

  select coalesce(buffer_minutes, 30), coalesce(min_notice_hours, 4), coalesce(max_notice_days, 30)
    into v_buffer, v_notice_h, v_max_days
    from public.business_settings where id;

  select greatest(coalesce(sum(p.duration_minutes), 0), 60) into v_duration
    from jsonb_array_elements(v_quote.line_items) li
    join public.products p on p.slug = li->>'slug';

  v_from := now() + make_interval(hours => v_notice_h);
  v_to   := now() + make_interval(days  => least(coalesce(p_days, 14), v_max_days));
  if v_to <= v_from then return; end if;

  return query
  with photogs as (
    select tm.id
      from public.team_members tm
     where tm.is_active and tm.role in ('admin','photographer')
  ),
  days as (
    select generate_series(
             (v_from at time zone 'America/New_York')::date,
             (v_to   at time zone 'America/New_York')::date,
             interval '1 day')::date as d
  ),
  windows as (
    select a.team_member_id as member_id,
           ((dd.d + a.start_local) at time zone a.timezone) as w_start,
           ((dd.d + a.end_local)   at time zone a.timezone) as w_end
      from days dd
      join public.team_availability a
        on a.is_active
       and a.day_of_week = extract(isodow from dd.d)::integer
      join photogs pg on pg.id = a.team_member_id
    union all
    select b.team_member_id, b.starts_at, b.ends_at
      from public.schedule_blocks b
      join photogs pg on pg.id = b.team_member_id
     where b.is_available and b.ends_at > v_from and b.starts_at < v_to
  ),
  candidates as (
    select distinct w.member_id,
           gs as c_start,
           gs + make_interval(mins => v_duration) as c_end
      from windows w
      cross join lateral generate_series(
             w.w_start,
             w.w_end - make_interval(mins => v_duration),
             interval '30 minutes') gs
     where gs >= v_from and gs + make_interval(mins => v_duration) <= v_to
  ),
  free as (
    select c.c_start, c.c_end
      from candidates c
     where not exists (
             select 1 from public.orders o
              where o.scheduled_at is not null
                and o.status not in ('cancelled','draft')
                and (o.photographer_id = c.member_id or o.photographer_id is null)
                and (c.c_start - make_interval(mins => v_buffer))
                    < (o.scheduled_at + make_interval(mins => coalesce(o.duration_minutes, 60)))
                and (c.c_end + make_interval(mins => v_buffer)) > o.scheduled_at)
       and not exists (
             select 1 from public.schedule_blocks b
              where b.team_member_id = c.member_id
                and not coalesce(b.is_available, false)
                and (c.c_start - make_interval(mins => v_buffer)) < b.ends_at
                and (c.c_end   + make_interval(mins => v_buffer)) > b.starts_at)
  )
  select distinct f.c_start, f.c_end
    from free f
   order by f.c_start;
end
$function$;
