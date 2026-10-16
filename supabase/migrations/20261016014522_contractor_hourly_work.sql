-- Separate hourly work ledger. Existing photo orders and pay requests are untouched.
create table public.contractor_hourly_assignments (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  title text not null check(length(trim(title)) between 2 and 180),
  event_type text not null check(length(trim(event_type)) between 2 and 100),
  role text not null check(length(trim(role)) between 2 and 100),
  location text not null default '' check(length(location)<=250),
  event_date date not null,
  rate_cents integer not null check(rate_cents between 1 and 1000000),
  estimated_minutes integer not null check(estimated_minutes between 1 and 1440),
  actual_minutes integer check(actual_minutes between 1 and 1440),
  approved_minutes integer check(approved_minutes between 1 and 1440),
  amount_cents integer generated always as (round(rate_cents::numeric * approved_minutes / 60)::integer) stored,
  instructions text not null default '' check(length(instructions)<=4000),
  time_note text not null default '' check(length(time_note)<=2000),
  review_note text not null default '' check(length(review_note)<=2000),
  paid_note text not null default '' check(length(paid_note)<=2000),
  status text not null default 'assigned' check(status in ('assigned','submitted','approved','paid','cancelled')),
  version integer not null default 1,
  created_by uuid not null,
  last_actor_id uuid not null,
  submitted_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status not in ('submitted','approved','paid') or actual_minutes is not null),
  check((status in ('approved','paid')) = (approved_minutes is not null)),
  check((status = 'paid') = (paid_at is not null)),
  check(status <> 'paid' or length(trim(paid_note)) >= 3)
);
create index contractor_hourly_owner_idx on public.contractor_hourly_assignments(contractor_id,status,event_date desc);
create index contractor_hourly_status_idx on public.contractor_hourly_assignments(status,event_date desc,id);
create table public.contractor_hourly_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.contractor_hourly_assignments(id) on delete restrict,
  actor_id uuid not null,
  kind text not null,
  details jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index contractor_hourly_events_parent_idx on public.contractor_hourly_events(assignment_id,created_at);
alter table public.contractor_hourly_assignments enable row level security;
alter table public.contractor_hourly_events enable row level security;
create policy hourly_read on public.contractor_hourly_assignments for select to authenticated using (
  contractor_id=public.current_contractor_id() or exists(select 1 from public.team_members t where t.id=(select auth.uid()) and t.is_active and t.role::text='admin')
);
create policy hourly_event_read on public.contractor_hourly_events for select to authenticated using (
  exists(select 1 from public.contractor_hourly_assignments a where a.id=assignment_id)
);
revoke all on public.contractor_hourly_assignments,public.contractor_hourly_events from anon,authenticated;
grant select on public.contractor_hourly_assignments,public.contractor_hourly_events to authenticated;
grant select,insert,update on public.contractor_hourly_assignments to service_role;
grant select,insert on public.contractor_hourly_events to service_role;

create function public.guard_hourly_records() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if tg_table_name='contractor_hourly_events' or tg_op='DELETE' then raise exception 'Hourly history is append-only'; end if;
  if old.status in ('paid','cancelled') then raise exception 'Closed hourly work is immutable'; end if;
  if new.contractor_id<>old.contractor_id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'Assignment ownership is immutable'; end if;
  return new;
end $$;
revoke all on function public.guard_hourly_records() from public;
create trigger hourly_guard before update or delete on public.contractor_hourly_assignments for each row execute function public.guard_hourly_records();
create trigger hourly_event_guard before update or delete on public.contractor_hourly_events for each row execute function public.guard_hourly_records();

-- Service-only RPC: re-checks the real actor and locks the assignment so approval,
-- payment and audit history commit together. The browser cannot supply p_actor.
create function public.contractor_hourly_action(p_actor uuid,p_action text,p_id uuid,p_version integer,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  a public.contractor_hourly_assignments%rowtype;
  previous jsonb;
  is_admin boolean;
  is_owner boolean;
  note_text text := coalesce(trim(p_data->>'note'),'');
  count_minutes integer;
begin
  select exists(select 1 from public.team_members where id=p_actor and is_active and role::text='admin') into is_admin;
  if p_action not in ('create','edit','submit','approve','return','cancel','pay') or p_action is null then return jsonb_build_object('error','invalid_data'); end if;
  if p_action <> 'submit' and not is_admin then return jsonb_build_object('error','forbidden'); end if;
  if p_id is null or p_actor is null or p_data is null then return jsonb_build_object('error','invalid_data'); end if;
  if p_action='create' then
    if not exists(select 1 from public.contractors where id=(p_data->>'contractor_id')::uuid and is_active) then return jsonb_build_object('error','inactive_contractor'); end if;
    insert into public.contractor_hourly_assignments(id,contractor_id,title,event_type,role,location,event_date,rate_cents,estimated_minutes,instructions,created_by,last_actor_id)
    values(p_id,(p_data->>'contractor_id')::uuid,trim(p_data->>'title'),trim(p_data->>'event_type'),trim(p_data->>'role'),coalesce(p_data->>'location',''),(p_data->>'event_date')::date,(p_data->>'rate_cents')::integer,(p_data->>'estimated_minutes')::integer,coalesce(p_data->>'instructions',''),p_actor,p_actor)
    on conflict(id) do nothing returning * into a;
    if not found then return jsonb_build_object('error','duplicate'); end if;
  else
    select * into a from public.contractor_hourly_assignments where id=p_id for update;
    if not found then return jsonb_build_object('error','not_found'); end if;
    select exists(select 1 from public.contractors where id=a.contractor_id and auth_user_id=p_actor and is_active) into is_owner;
    if not is_admin and not is_owner then return jsonb_build_object('error','forbidden'); end if;
    if p_version is null or a.version<>p_version then return jsonb_build_object('error','changed'); end if;
    if a.status in ('paid','cancelled') then return jsonb_build_object('error','invalid_state'); end if;
    previous=to_jsonb(a);
    if p_action='edit' then
      if a.status<>'assigned' then return jsonb_build_object('error','invalid_state'); end if;
      update public.contractor_hourly_assignments set title=trim(p_data->>'title'),event_type=trim(p_data->>'event_type'),role=trim(p_data->>'role'),location=coalesce(p_data->>'location',''),event_date=(p_data->>'event_date')::date,rate_cents=(p_data->>'rate_cents')::integer,estimated_minutes=(p_data->>'estimated_minutes')::integer,instructions=coalesce(p_data->>'instructions',''),version=version+1,last_actor_id=p_actor,updated_at=clock_timestamp() where id=p_id;
    elsif p_action='submit' then
      if a.status<>'assigned' then return jsonb_build_object('error','invalid_state'); end if;
      count_minutes=(p_data->>'actual_minutes')::integer;
      if count_minutes is null or count_minutes not between 1 and 1440 then return jsonb_build_object('error','invalid_data'); end if;
      if count_minutes>a.estimated_minutes and length(note_text)<3 then return jsonb_build_object('error','note_required'); end if;
      update public.contractor_hourly_assignments set actual_minutes=count_minutes,time_note=note_text,status='submitted',submitted_at=now(),version=version+1,last_actor_id=p_actor,updated_at=clock_timestamp() where id=p_id;
    elsif p_action='approve' then
      if a.status<>'submitted' then return jsonb_build_object('error','invalid_state'); end if;
      count_minutes=(p_data->>'approved_minutes')::integer;
      if count_minutes is null or count_minutes not between 1 and 1440 then return jsonb_build_object('error','invalid_data'); end if;
      if count_minutes<>a.actual_minutes and length(note_text)<3 then return jsonb_build_object('error','note_required'); end if;
      update public.contractor_hourly_assignments set approved_minutes=count_minutes,review_note=note_text,status='approved',approved_at=now(),version=version+1,last_actor_id=p_actor,updated_at=clock_timestamp() where id=p_id;
    elsif p_action='return' then
      if a.status not in ('submitted','approved') then return jsonb_build_object('error','invalid_state'); end if;
      if length(note_text)<3 then return jsonb_build_object('error','note_required'); end if;
      update public.contractor_hourly_assignments set status='assigned',actual_minutes=null,approved_minutes=null,submitted_at=null,approved_at=null,time_note='',review_note=note_text,version=version+1,last_actor_id=p_actor,updated_at=clock_timestamp() where id=p_id;
    elsif p_action='cancel' then
      if length(note_text)<3 then return jsonb_build_object('error','note_required'); end if;
      update public.contractor_hourly_assignments set status='cancelled',approved_minutes=null,approved_at=null,review_note=note_text,version=version+1,last_actor_id=p_actor,updated_at=clock_timestamp() where id=p_id;
    elsif p_action='pay' then
      if a.status<>'approved' then return jsonb_build_object('error','invalid_state'); end if;
      if length(note_text)<3 then return jsonb_build_object('error','note_required'); end if;
      update public.contractor_hourly_assignments set status='paid',paid_at=now(),paid_note=note_text,version=version+1,last_actor_id=p_actor,updated_at=clock_timestamp() where id=p_id;
    end if;
    select * into a from public.contractor_hourly_assignments where id=p_id;
  end if;
  insert into public.contractor_hourly_events(assignment_id,actor_id,kind,details) values(a.id,p_actor,p_action,jsonb_build_object('before',previous,'after',to_jsonb(a)));
  return jsonb_build_object('id',a.id,'version',a.version);
end $$;
revoke all on function public.contractor_hourly_action(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.contractor_hourly_action(uuid,text,uuid,integer,jsonb) to service_role;

-- Aggregation in Postgres avoids silently truncating balances at the API row cap.
create view public.contractor_hourly_balances with (security_invoker=true) as
select contractor_id,
  count(*) filter (where status in ('approved','paid'))::integer as total,
  count(*) filter (where status in ('approved','paid') and event_date>=date_trunc('month',now() at time zone 'America/New_York')::date and event_date<(date_trunc('month',now() at time zone 'America/New_York')+interval '1 month')::date)::integer as this_month,
  count(*) filter (where status='approved')::integer as unpaid_count,
  coalesce(sum(amount_cents) filter (where status='approved'),0)::bigint as owed_cents
from public.contractor_hourly_assignments group by contractor_id;
revoke all on public.contractor_hourly_balances from anon,authenticated;
grant select on public.contractor_hourly_balances to authenticated,service_role;
