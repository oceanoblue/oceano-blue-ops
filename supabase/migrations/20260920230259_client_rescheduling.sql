alter table public.business_settings
  add column client_rescheduling_enabled boolean not null default true,
  add column client_reschedule_cutoff_hours integer not null default 48 check(client_reschedule_cutoff_hours between 0 and 720);

create table public.client_reschedule_requests (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_scheduled_at timestamptz not null,
  scheduled_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index client_reschedule_requests_order_idx on public.client_reschedule_requests(order_id);
alter table public.client_reschedule_requests enable row level security;
revoke all on public.client_reschedule_requests from public,anon,authenticated;
grant all on public.client_reschedule_requests to service_role;
grant select on public.client_reschedule_requests to authenticated;
create policy "staff read reschedule history" on public.client_reschedule_requests for select to authenticated using(public.is_team_member());

-- A booking and each subsequent change need independent durable follow-ups.
alter table public.booking_followups add column event_key text not null default 'booking';
alter table public.booking_followups drop constraint booking_followups_order_id_kind_recipient_key;
alter table public.booking_followups add constraint booking_followups_event_recipient_key unique(order_id,kind,recipient,event_key);

create function public.commit_client_reschedule(
  p_request_id uuid, p_order_id uuid, p_client_ids uuid[], p_previous timestamptz,
  p_scheduled_at timestamptz, p_photographer_id uuid, p_duration integer
) returns timestamptz language plpgsql security invoker set search_path=public as $$
declare
  v_order public.orders;
  v_settings public.business_settings;
  v_existing public.client_reschedule_requests;
  v_payload jsonb;
begin
  select * into v_order from public.orders where id=p_order_id and client_id=any(p_client_ids) for update;
  if not found then raise exception 'order_not_found'; end if;
  select * into v_existing from public.client_reschedule_requests where id=p_request_id;
  if found then
    if v_existing.order_id<>p_order_id or v_existing.scheduled_at<>p_scheduled_at or v_existing.previous_scheduled_at<>p_previous then raise exception 'request_changed'; end if;
    return v_existing.scheduled_at;
  end if;
  select * into v_settings from public.business_settings where id=true;
  if not found or not v_settings.client_rescheduling_enabled then raise exception 'rescheduling_disabled'; end if;
  if v_order.status not in ('booked','scheduled') or v_order.scheduled_at is null or v_order.photographer_id is null then raise exception 'contact_office'; end if;
  if v_order.scheduled_at < now()+make_interval(hours=>v_settings.client_reschedule_cutoff_hours) then raise exception 'cutoff_passed'; end if;
  if v_order.scheduled_at is distinct from p_previous or v_order.photographer_id is distinct from p_photographer_id
    or coalesce(v_order.duration_minutes,60) is distinct from p_duration then raise exception 'order_changed'; end if;
  if p_request_id is null or p_scheduled_at is null or p_duration not between 15 and 720 then raise exception 'invalid_request'; end if;
  if p_scheduled_at < now()+make_interval(hours=>coalesce(v_settings.min_notice_hours,4))
    or (p_scheduled_at at time zone coalesce(v_settings.default_timezone,'America/New_York'))::date >
       (now() at time zone coalesce(v_settings.default_timezone,'America/New_York'))::date+coalesce(v_settings.max_notice_days,30)
    then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  perform pg_advisory_xact_lock(hashtext(p_photographer_id::text)::bigint);
  if not exists(select 1 from public.team_members where id=p_photographer_id and is_active and role in ('admin','photographer')) then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  if not exists(select 1 from public.team_availability a where a.team_member_id=p_photographer_id and a.is_active
    and a.day_of_week=extract(dow from p_scheduled_at at time zone a.timezone)
    and p_scheduled_at>=(((p_scheduled_at at time zone a.timezone)::date+a.start_local) at time zone a.timezone)
    and p_scheduled_at+make_interval(mins=>p_duration)<=(((p_scheduled_at at time zone a.timezone)::date+a.end_local) at time zone a.timezone))
    then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  if exists(select 1 from public.schedule_blocks b where b.team_member_id=p_photographer_id and not b.is_available
    and p_scheduled_at<b.ends_at+make_interval(mins=>coalesce(v_settings.buffer_minutes,30))
    and p_scheduled_at+make_interval(mins=>p_duration+coalesce(v_settings.buffer_minutes,30))>b.starts_at)
    then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  perform set_config('app.allow_double_book','off',true);
  update public.orders set scheduled_at=p_scheduled_at,updated_at=now() where id=p_order_id;
  insert into public.client_reschedule_requests(id,order_id,previous_scheduled_at,scheduled_at) values(p_request_id,p_order_id,p_previous,p_scheduled_at);
  select jsonb_build_object('event','rescheduled','client_name',c.full_name,'client_email',c.email,'client_phone',c.phone,
    'address_line1',l.address_line1,'city',l.city,'state',l.state,'zip',l.zip,'timezone',coalesce(v_settings.default_timezone,'America/New_York'),
    'scheduled_at',p_scheduled_at,'previous_scheduled_at',p_previous)
    into v_payload from public.clients c join public.listings l on l.id=v_order.listing_id where c.id=v_order.client_id;
  insert into public.booking_followups(order_id,kind,recipient,payload,event_key) values(p_order_id,'calendar','',coalesce(v_payload,'{}'::jsonb),p_request_id::text);
  if coalesce(v_payload->>'client_email','')<>'' then
    insert into public.booking_followups(order_id,kind,recipient,payload,event_key) values(p_order_id,'client_email',v_payload->>'client_email',v_payload,p_request_id::text);
  end if;
  insert into public.booking_followups(order_id,kind,recipient,payload,event_key)
    select p_order_id,'office_email',lower(email),v_payload,p_request_id::text from public.team_members where is_active and role='admin' and coalesce(email,'')<>'' on conflict do nothing;
  return p_scheduled_at;
end;$$;
revoke all on function public.commit_client_reschedule(uuid,uuid,uuid[],timestamptz,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.commit_client_reschedule(uuid,uuid,uuid[],timestamptz,timestamptz,uuid,integer) to service_role;
