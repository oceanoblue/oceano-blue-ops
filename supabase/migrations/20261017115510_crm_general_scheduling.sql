-- Reusable consultation / planning sessions. Property /book keeps its existing
-- ledger; reservations share its owner lock and schedule_blocks conflict guard.
create table public.crm_session_types (
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 120),
 slug text not null unique check(length(slug)<=80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),description text not null default '' check(length(description)<=2000),
 owner_id uuid not null references public.team_members(id),duration_minutes integer not null check(duration_minutes between 15 and 720),
 timezone text not null,availability jsonb not null check(jsonb_typeof(availability)='array' and jsonb_array_length(availability) between 1 and 21),
 notice_minutes integer not null default 1440 check(notice_minutes between 0 and 43200),horizon_days integer not null default 90 check(horizon_days between 1 and 365),
 buffer_minutes integer not null default 15 check(buffer_minutes between 0 and 180),location text not null default '' check(length(location)<=500),
 published boolean not null default false,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index crm_session_types_owner_idx on public.crm_session_types(owner_id);
create table public.crm_appointments (
 id uuid primary key,session_type_id uuid references public.crm_session_types(id),
 client_id uuid not null references public.clients(id),project_id uuid not null references public.projects(id),owner_id uuid not null references public.team_members(id),
 title text not null,location text not null,timezone text not null,full_name text not null,email text not null,phone text not null default '',notes text not null default '',
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),buffer_minutes integer not null,
 status text not null default 'confirmed' check(status in ('confirmed','cancelled')),version integer not null default 1,
 manage_token text not null unique check(manage_token ~ '^[a-f0-9]{64}$'),payload_hash text not null,
 email_consent boolean not null default false,task_id uuid not null references public.crm_tasks(id),schedule_block_id uuid not null unique,
 source_system text not null default 'ops' check(source_system in ('ops','honeybook','google')),source_id text,
 source_evidence jsonb not null default '{}' check(jsonb_typeof(source_evidence)='object'),import_state text not null default 'native' check(import_state in ('native','reference','migrated')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(source_system,source_id)
);
create index crm_appointments_owner_time_idx on public.crm_appointments(owner_id,starts_at) where status='confirmed';
create index crm_appointments_project_idx on public.crm_appointments(project_id,starts_at);
create index crm_appointments_client_idx on public.crm_appointments(client_id);
create index crm_appointments_type_idx on public.crm_appointments(session_type_id);
create index crm_appointments_task_idx on public.crm_appointments(task_id);
create table public.crm_session_notifications (
 id uuid primary key default gen_random_uuid(),appointment_id uuid not null references public.crm_appointments(id),appointment_version integer not null,
 kind text not null check(kind in ('confirmation','rescheduled','cancelled','reminder','reminder_1h','calendar')),audience text not null default 'client' check(audience in ('client','office')),due_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','sending','accepted','cancelled','needs_review')),
 attempts integer not null default 0,lease_token uuid,locked_at timestamptz,first_attempt_at timestamptz,provider_id text,last_error text,created_at timestamptz not null default now(),
 unique(appointment_id,appointment_version,kind,audience)
);
create index crm_session_notifications_due_idx on public.crm_session_notifications(due_at) where status in ('pending','sending');
do $$ declare tbl text; begin
 foreach tbl in array array['crm_session_types','crm_appointments','crm_session_notifications'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from public,anon,authenticated',tbl);
  execute format('grant select on public.%I to authenticated',tbl);
  execute format('grant select,insert,update on public.%I to service_role',tbl);
  execute format('create policy office_read on public.%I for select to authenticated using (exists(select 1 from public.team_members t where t.id=(select auth.uid()) and t.is_active and t.role::text in (''admin'',''coordinator'')))',tbl);
 end loop;
end $$;

create function public.crm_enqueue_session_notifications(p_id uuid,p_version integer,p_kind text,p_start timestamptz,p_consent boolean)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 insert into public.crm_session_notifications(appointment_id,appointment_version,kind,audience,due_at) values(p_id,p_version,'calendar','office',now()),(p_id,p_version,p_kind,'office',now());
 if p_consent then insert into public.crm_session_notifications(appointment_id,appointment_version,kind,audience,due_at) values(p_id,p_version,p_kind,'client',now());end if;
 if p_kind<>'cancelled' then
  if p_start>now()+interval '24 hours 5 minutes' then
   insert into public.crm_session_notifications(appointment_id,appointment_version,kind,audience,due_at) values(p_id,p_version,'reminder','office',p_start-interval '24 hours');
   if p_consent then insert into public.crm_session_notifications(appointment_id,appointment_version,kind,audience,due_at) values(p_id,p_version,'reminder','client',p_start-interval '24 hours');end if;
  end if;
  if p_start>now()+interval '1 hour 5 minutes' then
   insert into public.crm_session_notifications(appointment_id,appointment_version,kind,audience,due_at) values(p_id,p_version,'reminder_1h','office',p_start-interval '1 hour');
   if p_consent then insert into public.crm_session_notifications(appointment_id,appointment_version,kind,audience,due_at) values(p_id,p_version,'reminder_1h','client',p_start-interval '1 hour');end if;
  end if;
 end if;
end $$;
revoke all on function public.crm_enqueue_session_notifications(uuid,integer,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.crm_enqueue_session_notifications(uuid,integer,text,timestamptz,boolean) to service_role;

create function public.crm_session_type_save(p_actor uuid,p_id uuid,p_version integer,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare t public.crm_session_types%rowtype; w jsonb;
begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then raise exception 'Office access required.' using errcode='42501';end if;
 if not exists(select 1 from public.team_members where id=(p_data->>'owner_id')::uuid and is_active and role::text in ('admin','coordinator')) then raise exception 'Choose an active office host.';end if;
 if not exists(select 1 from pg_timezone_names where name=p_data->>'timezone') then raise exception 'Invalid timezone.';end if;
 if jsonb_typeof(p_data->'availability') is distinct from 'array' then raise exception 'Add availability.';end if;
 for w in select jsonb_array_elements(p_data->'availability') loop
  if (w->>'day')::integer not between 0 and 6 or w->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or w->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or w->>'end' <= w->>'start' then raise exception 'Invalid availability.';end if;
 end loop;
 select * into t from public.crm_session_types where id=p_id for update;
 if found and t.version is distinct from p_version then raise exception 'Record changed. Reload before saving.' using errcode='40001';end if;
 if not found and p_version is not null then raise exception 'Session link not found.';end if;
 insert into public.crm_session_types(id,name,slug,description,owner_id,duration_minutes,timezone,availability,notice_minutes,horizon_days,buffer_minutes,location,published)
 values(p_id,trim(p_data->>'name'),p_data->>'slug',p_data->>'description',(p_data->>'owner_id')::uuid,(p_data->>'duration_minutes')::integer,p_data->>'timezone',p_data->'availability',(p_data->>'notice_minutes')::integer,(p_data->>'horizon_days')::integer,(p_data->>'buffer_minutes')::integer,p_data->>'location',(p_data->>'published')::boolean)
 on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,owner_id=excluded.owner_id,duration_minutes=excluded.duration_minutes,timezone=excluded.timezone,availability=excluded.availability,notice_minutes=excluded.notice_minutes,horizon_days=excluded.horizon_days,buffer_minutes=excluded.buffer_minutes,location=excluded.location,published=excluded.published,version=crm_session_types.version+1,updated_at=now();
 insert into public.crm_events(actor_id,kind,body,details) values(p_actor,'session_link_saved','Session link updated',jsonb_build_object('session_type_id',p_id,'published',(p_data->>'published')::boolean));
 return jsonb_build_object('ok',true,'id',p_id);
end $$;
revoke all on function public.crm_session_type_save(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.crm_session_type_save(uuid,uuid,integer,jsonb) to service_role;

-- Called only after the server verifies Google live availability. Locks match
-- public shoot booking; SQL independently verifies hours and internal conflicts.
create function public.crm_session_commit(p_id uuid,p_slug text,p_hash text,p_data jsonb,p_type_version integer,p_calendar_checked_at timestamptz)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare t public.crm_session_types%rowtype; a public.crm_appointments%rowtype; start_at timestamptz; end_at timestamptz; cid uuid;pid uuid;tid uuid:=gen_random_uuid();bid uuid:=gen_random_uuid();sid uuid;wall timestamp;result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,733));
 select * into a from public.crm_appointments where id=p_id;
 if found then
  if a.payload_hash<>p_hash or not exists(select 1 from public.crm_session_types where id=a.session_type_id and slug=p_slug) then raise exception 'This request was already used.' using errcode='40001';end if;
  return jsonb_build_object('ok',true,'id',a.id,'token',a.manage_token);
 end if;
 select * into t from public.crm_session_types where slug=p_slug and published for share;
 if not found or t.version<>p_type_version then raise exception 'Session availability changed. Please reload.' using errcode='40001';end if;
 if not exists(select 1 from public.team_members where id=t.owner_id and is_active and role::text in ('admin','coordinator')) then raise exception 'This session is unavailable.';end if;
 if p_calendar_checked_at is null or p_calendar_checked_at<clock_timestamp()-interval '2 minutes' or p_calendar_checked_at>clock_timestamp()+interval '5 seconds' then raise exception 'Calendar verification expired. Please reload.';end if;
 start_at:=(p_data->>'starts_at')::timestamptz;end_at:=start_at+make_interval(mins=>t.duration_minutes);wall:=start_at at time zone t.timezone;
 if start_at<now()+make_interval(mins=>t.notice_minutes) or wall::date>(now() at time zone t.timezone)::date+t.horizon_days or extract(second from wall)<>0 then raise exception 'This time is unavailable.' using errcode='23P01';end if;
 if not exists(select 1 from jsonb_array_elements(t.availability) w where (w->>'day')::integer=extract(dow from wall) and wall::time>=(w->>'start')::time and (end_at at time zone t.timezone)::date=wall::date and (end_at at time zone t.timezone)::time<=(w->>'end')::time and mod((extract(epoch from (wall::time-(w->>'start')::time))/60)::integer,15)=0) then raise exception 'This time is unavailable.' using errcode='23P01';end if;
 perform pg_advisory_xact_lock(hashtext(t.owner_id::text)::bigint);
 if exists(select 1 from public.schedule_blocks b where b.team_member_id=t.owner_id and not b.is_available and start_at-make_interval(mins=>t.buffer_minutes)<b.ends_at and end_at+make_interval(mins=>t.buffer_minutes)>b.starts_at)
 or exists(select 1 from public.crm_appointments b where b.owner_id=t.owner_id and b.status='confirmed' and start_at-make_interval(mins=>t.buffer_minutes)<b.ends_at+make_interval(mins=>b.buffer_minutes) and end_at+make_interval(mins=>t.buffer_minutes)>b.starts_at-make_interval(mins=>b.buffer_minutes))
 or exists(select 1 from public.orders o left join public.contractors c on c.id=o.contractor_id where o.status::text not in ('cancelled','draft') and o.scheduled_at is not null and ((coalesce(c.team_member_id,o.photographer_id)=t.owner_id and start_at-make_interval(mins=>t.buffer_minutes)<o.scheduled_at+make_interval(mins=>coalesce(o.photographer_start_offset_minutes,0)+coalesce(o.photographer_duration_minutes,o.duration_minutes,60)) and end_at+make_interval(mins=>t.buffer_minutes)>o.scheduled_at+make_interval(mins=>coalesce(o.photographer_start_offset_minutes,0))) or (o.videographer_id=t.owner_id and start_at-make_interval(mins=>t.buffer_minutes)<o.scheduled_at+make_interval(mins=>coalesce(o.videographer_start_offset_minutes,0)+coalesce(o.videographer_duration_minutes,o.duration_minutes,60)) and end_at+make_interval(mins=>t.buffer_minutes)>o.scheduled_at+make_interval(mins=>coalesce(o.videographer_start_offset_minutes,0))))) then raise exception 'This time was just booked. Choose another.' using errcode='23P01';end if;
 if length(trim(coalesce(p_data->>'full_name',''))) not between 2 and 120 or length(coalesce(p_data->>'email',''))>254 or coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(coalesce(p_data->>'notes',''))>2000 or length(coalesce(p_data->>'phone',''))>50 then raise exception 'Check your contact details.';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_data->>'email')),721));
 select id into cid from public.clients where lower(email)=lower(trim(p_data->>'email')) order by created_at,id limit 1;
 if cid is null then insert into public.clients(full_name,email,phone) values(trim(p_data->>'full_name'),lower(trim(p_data->>'email')),nullif(p_data->>'phone','')) returning id into cid;end if;
 insert into public.crm_contact_profiles(client_id) values(cid) on conflict do nothing;
 select id into sid from public.crm_stages where outcome='open' order by position,id limit 1;
 if sid is null then raise exception 'Inquiry stage missing.';end if;
 insert into public.projects(client_id,name,description,created_by) values(cid,left(t.name||' — '||trim(p_data->>'full_name'),180),coalesce(p_data->>'notes',''),t.owner_id) returning id into pid;
 insert into public.crm_opportunities(id,project_id,client_id,title,stage_id,project_type,lead_source,next_follow_up,owner_id,description) select pid,pid,cid,name,sid,'Consultation','Scheduling link',start_at,t.owner_id,coalesce(p_data->>'notes','') from public.projects where id=pid;
 insert into public.crm_tasks(id,client_id,project_id,title,owner_id,due_at) values(tid,cid,pid,left('Attend: '||t.name,180),t.owner_id,start_at);
 insert into public.schedule_blocks(id,team_member_id,starts_at,ends_at,reason,is_available) values(bid,t.owner_id,start_at-make_interval(mins=>t.buffer_minutes),end_at+make_interval(mins=>t.buffer_minutes),'crm-session:'||p_id,false);
 insert into public.crm_appointments(id,session_type_id,client_id,project_id,owner_id,title,location,timezone,full_name,email,phone,notes,starts_at,ends_at,buffer_minutes,manage_token,payload_hash,email_consent,task_id,schedule_block_id)
 values(p_id,t.id,cid,pid,t.owner_id,t.name,t.location,t.timezone,trim(p_data->>'full_name'),lower(trim(p_data->>'email')),coalesce(p_data->>'phone',''),coalesce(p_data->>'notes',''),start_at,end_at,t.buffer_minutes,p_data->>'manage_token',p_hash,coalesce((p_data->>'email_consent')::boolean,false),tid,bid) returning * into a;
 insert into public.crm_events(client_id,project_id,kind,body,details) values(cid,pid,'session_booked','Client scheduled '||t.name,jsonb_build_object('appointment_id',p_id,'starts_at',start_at));
 perform public.crm_enqueue_session_notifications(a.id,1,'confirmation',start_at,a.email_consent);
 return jsonb_build_object('ok',true,'id',a.id,'token',a.manage_token);
end $$;
revoke all on function public.crm_session_commit(uuid,text,text,jsonb,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_session_commit(uuid,text,text,jsonb,integer,timestamptz) to service_role;

create function public.crm_session_change(p_id uuid,p_token text,p_actor uuid,p_action text,p_version integer,p_start timestamptz,p_calendar_checked_at timestamptz,p_type_version integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.crm_appointments%rowtype;t public.crm_session_types%rowtype;end_at timestamptz;wall timestamp;is_office boolean;
begin
 is_office:=p_actor is not null and exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator'));
 if p_actor is not null and not is_office then raise exception 'Office access required.' using errcode='42501';end if;
 select * into a from public.crm_appointments where id=p_id and (is_office or manage_token=p_token) for update;
 if not found then raise exception 'Session not found.' using errcode='42501';end if;
 if a.version<>p_version then raise exception 'Record changed. Reload before saving.' using errcode='40001';end if;
 if a.status='cancelled' then raise exception 'This session is cancelled.';end if;
 if a.import_state='reference' then raise exception 'This imported appointment is still managed in its source system. Contact the office.';end if;
 if not is_office and a.starts_at<=now() then raise exception 'Please contact the office to change this session.';end if;
 perform pg_advisory_xact_lock(hashtext(a.owner_id::text)::bigint);
 if p_action='cancel' then
  update public.crm_appointments set status='cancelled',version=version+1,updated_at=now() where id=a.id;
  update public.schedule_blocks set is_available=true,reason='crm-session-cancelled:'||a.id where id=a.schedule_block_id;
  update public.crm_tasks set completed_at=now(),version=version+1 where id=a.task_id and completed_at is null;
  update public.crm_opportunities set next_follow_up=now(),version=version+1 where project_id=a.project_id and next_follow_up=a.starts_at;
 else
  if p_action<>'reschedule' then raise exception 'Invalid session action.';end if;
  select * into t from public.crm_session_types where id=a.session_type_id for share;
  if not t.published or t.owner_id<>a.owner_id or t.version is distinct from p_type_version then raise exception 'Session link changed. Contact the office.';end if;
  if p_calendar_checked_at is null or p_calendar_checked_at<clock_timestamp()-interval '2 minutes' or p_calendar_checked_at>clock_timestamp()+interval '5 seconds' then raise exception 'Calendar verification expired.';end if;
  end_at:=p_start+make_interval(mins=>t.duration_minutes);wall:=p_start at time zone t.timezone;
  if p_start<now()+make_interval(mins=>t.notice_minutes) or wall::date>(now() at time zone t.timezone)::date+t.horizon_days or extract(second from wall)<>0 or not exists(select 1 from jsonb_array_elements(t.availability) w where (w->>'day')::integer=extract(dow from wall) and wall::time>=(w->>'start')::time and (end_at at time zone t.timezone)::date=wall::date and (end_at at time zone t.timezone)::time<=(w->>'end')::time and mod((extract(epoch from (wall::time-(w->>'start')::time))/60)::integer,15)=0) then raise exception 'This time is unavailable.' using errcode='23P01';end if;
  if exists(select 1 from public.schedule_blocks b where b.id<>a.schedule_block_id and b.team_member_id=a.owner_id and not b.is_available and p_start-make_interval(mins=>t.buffer_minutes)<b.ends_at and end_at+make_interval(mins=>t.buffer_minutes)>b.starts_at)
  or exists(select 1 from public.crm_appointments b where b.id<>a.id and b.owner_id=a.owner_id and b.status='confirmed' and p_start-make_interval(mins=>t.buffer_minutes)<b.ends_at+make_interval(mins=>b.buffer_minutes) and end_at+make_interval(mins=>t.buffer_minutes)>b.starts_at-make_interval(mins=>b.buffer_minutes))
  or exists(select 1 from public.orders o left join public.contractors c on c.id=o.contractor_id where o.status::text not in ('cancelled','draft') and o.scheduled_at is not null and ((coalesce(c.team_member_id,o.photographer_id)=a.owner_id and p_start-make_interval(mins=>t.buffer_minutes)<o.scheduled_at+make_interval(mins=>coalesce(o.photographer_start_offset_minutes,0)+coalesce(o.photographer_duration_minutes,o.duration_minutes,60)) and end_at+make_interval(mins=>t.buffer_minutes)>o.scheduled_at+make_interval(mins=>coalesce(o.photographer_start_offset_minutes,0))) or (o.videographer_id=a.owner_id and p_start-make_interval(mins=>t.buffer_minutes)<o.scheduled_at+make_interval(mins=>coalesce(o.videographer_start_offset_minutes,0)+coalesce(o.videographer_duration_minutes,o.duration_minutes,60)) and end_at+make_interval(mins=>t.buffer_minutes)>o.scheduled_at+make_interval(mins=>coalesce(o.videographer_start_offset_minutes,0))))) then raise exception 'This time was just booked. Choose another.' using errcode='23P01';end if;
  update public.crm_appointments set starts_at=p_start,ends_at=end_at,timezone=t.timezone,location=t.location,buffer_minutes=t.buffer_minutes,version=version+1,updated_at=now() where id=a.id;
  update public.schedule_blocks set starts_at=p_start-make_interval(mins=>t.buffer_minutes),ends_at=end_at+make_interval(mins=>t.buffer_minutes) where id=a.schedule_block_id;
  update public.crm_tasks set due_at=p_start,version=version+1 where id=a.task_id;
  update public.crm_opportunities set next_follow_up=p_start,version=version+1 where project_id=a.project_id and next_follow_up=a.starts_at;
 end if;
 update public.crm_session_notifications set status='cancelled' where appointment_id=a.id and status='pending';
 perform public.crm_enqueue_session_notifications(a.id,a.version+1,case when p_action='cancel' then 'cancelled' else 'rescheduled' end,p_start,a.email_consent);
 insert into public.crm_events(client_id,project_id,actor_id,kind,body,details) values(a.client_id,a.project_id,p_actor,'session_'||p_action,case when p_action='cancel' then 'Session cancelled' else 'Session rescheduled' end,jsonb_build_object('appointment_id',a.id,'previous_starts_at',a.starts_at,'starts_at',p_start));
 return jsonb_build_object('ok',true,'id',a.id);
end $$;
revoke all on function public.crm_session_change(uuid,text,uuid,text,integer,timestamptz,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.crm_session_change(uuid,text,uuid,text,integer,timestamptz,timestamptz,integer) to service_role;

create function public.crm_claim_session_notifications(p_limit integer default 3)
returns setof public.crm_session_notifications language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.crm_session_notifications set status='needs_review',last_error='Delivery could not be verified within the safe retry window.' where status in ('pending','sending') and first_attempt_at<now()-interval '23 hours';
 return query with candidates as (
  select n.id,row_number() over(partition by n.appointment_id order by case when n.kind='calendar' then 0 else 1 end,n.due_at,n.id) as rank from public.crm_session_notifications n
  where (n.status='pending' and n.due_at<=now() or n.status='sending' and n.locked_at<now()-interval '5 minutes') and n.attempts<5
  and not exists(select 1 from public.crm_session_notifications active where active.appointment_id=n.appointment_id and active.status='sending' and active.locked_at>=now()-interval '5 minutes')
 ), picked as (select n.id from public.crm_session_notifications n join candidates c on c.id=n.id and c.rank=1 order by n.due_at,n.id for update of n skip locked limit greatest(0,least(p_limit,5)))
 update public.crm_session_notifications n set status='sending',attempts=n.attempts+1,lease_token=gen_random_uuid(),locked_at=now(),first_attempt_at=coalesce(n.first_attempt_at,now()) from picked p where n.id=p.id returning n.*;
 update public.crm_session_notifications set status='needs_review',last_error='Final delivery attempt needs review.' where status='sending' and attempts>=5 and locked_at<now()-interval '5 minutes';
end $$;
revoke all on function public.crm_claim_session_notifications(integer) from public,anon,authenticated;
grant execute on function public.crm_claim_session_notifications(integer) to service_role;

-- Verified source commitments are reference reservations, never a replay of
-- HoneyBook emails, invitations, payment requests or automation.
create function public.crm_session_import(p_actor uuid,p_id uuid,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare existing public.crm_appointments%rowtype;c public.clients%rowtype;pid uuid;oid uuid;tid uuid:=gen_random_uuid();bid uuid:=gen_random_uuid();start_at timestamptz;end_at timestamptz;state text;source text;sid text;
begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then raise exception 'Office access required.' using errcode='42501';end if;
 source:=p_data->>'source_system';sid:=trim(p_data->>'source_id');
 if source not in ('honeybook','google') or length(coalesce(sid,'')) not between 1 and 240 or jsonb_typeof(p_data->'source_evidence') is distinct from 'object' or length((p_data->'source_evidence')::text)>50000 then raise exception 'A verified source reference is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended(source||':'||sid,734));
 select * into existing from public.crm_appointments where source_system=source and source_id=sid;
 if found then return jsonb_build_object('ok',true,'id',existing.id,'skipped',true);end if;
 oid:=(p_data->>'owner_id')::uuid;pid:=(p_data->>'project_id')::uuid;start_at:=(p_data->>'starts_at')::timestamptz;end_at:=(p_data->>'ends_at')::timestamptz;state:=coalesce(p_data->>'status','confirmed');
 if not exists(select 1 from public.team_members where id=oid and is_active and role::text in ('admin','coordinator')) or not exists(select 1 from pg_timezone_names where name=p_data->>'timezone') then raise exception 'Invalid host or timezone.';end if;
 if end_at<=start_at or end_at>start_at+interval '31 days' or state not in ('confirmed','cancelled') or length(trim(coalesce(p_data->>'title',''))) not between 1 and 180 then raise exception 'Verify the source appointment time and title.';end if;
 select cl.* into c from public.clients cl join public.projects p on p.client_id=cl.id where p.id=pid and cl.id=(p_data->>'client_id')::uuid;
 if not found then raise exception 'Project does not belong to this contact.';end if;
 if exists(select 1 from public.crm_opportunities o join public.crm_stages s on s.id=o.stage_id where o.project_id=pid and s.outcome='archived') and end_at>now() and state='confirmed' then raise exception 'Reopen the project before importing upcoming commitments.';end if;
 perform pg_advisory_xact_lock(hashtext(oid::text)::bigint);
 insert into public.crm_tasks(id,client_id,project_id,title,owner_id,due_at,completed_at) values(tid,c.id,pid,left('Attend: '||trim(p_data->>'title'),180),oid,start_at,case when end_at<now() or state='cancelled' then now() else null end);
 insert into public.schedule_blocks(id,team_member_id,starts_at,ends_at,reason,is_available) values(bid,oid,start_at,end_at,'crm-session:'||p_id,state='cancelled');
 insert into public.crm_appointments(id,client_id,project_id,owner_id,title,location,timezone,full_name,email,phone,notes,starts_at,ends_at,buffer_minutes,status,manage_token,payload_hash,email_consent,task_id,schedule_block_id,source_system,source_id,source_evidence,import_state)
 values(p_id,c.id,pid,oid,trim(p_data->>'title'),left(coalesce(p_data->>'location',''),500),p_data->>'timezone',c.full_name,coalesce(c.email,''),coalesce(c.phone,''),left(coalesce(p_data->>'notes',''),2000),start_at,end_at,0,state,p_data->>'manage_token','source:'||source||':'||sid,false,tid,bid,source,sid,p_data->'source_evidence','reference');
 insert into public.crm_events(client_id,project_id,actor_id,kind,body,details) values(c.id,pid,p_actor,'session_imported','Verified source appointment recorded without client messages',jsonb_build_object('appointment_id',p_id,'source_system',source,'source_id',sid,'starts_at',start_at,'ends_at',end_at));
 return jsonb_build_object('ok',true,'id',p_id,'skipped',false);
end $$;
revoke all on function public.crm_session_import(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_session_import(uuid,uuid,jsonb) to service_role;

create function public.crm_session_source_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.source_system is distinct from old.source_system or new.source_id is distinct from old.source_id or new.source_evidence is distinct from old.source_evidence then raise exception 'Source evidence is immutable.';end if;
 return new;
end $$;
revoke all on function public.crm_session_source_immutable() from public,anon,authenticated;
create trigger crm_session_source_immutable before update on public.crm_appointments for each row execute function public.crm_session_source_immutable();
