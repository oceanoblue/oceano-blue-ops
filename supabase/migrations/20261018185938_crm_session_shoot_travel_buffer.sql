-- Preserve the existing organization travel buffer when a CRM session is created or moved next to a shoot.
-- Orders keep their role-specific visit windows; session-to-session buffers and stored CRM holds are unchanged.
-- Use the same host advisory lock as order scheduling so either booking direction enforces both buffers.
create or replace function public.crm_session_commit(p_id uuid,p_slug text,p_hash text,p_data jsonb,p_type_version integer,p_calendar_checked_at timestamptz)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare t public.crm_session_types%rowtype; a public.crm_appointments%rowtype; start_at timestamptz; end_at timestamptz; cid uuid;pid uuid;tid uuid:=gen_random_uuid();bid uuid:=gen_random_uuid();sid uuid;wall timestamp;result jsonb;shoot_buffer integer;
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
 if start_at<now()+make_interval(mins=>t.notice_minutes) or wall::date>(case when t.booking_horizon_months is not null then ((now() at time zone t.timezone)::date+make_interval(months=>t.booking_horizon_months))::date else (now() at time zone t.timezone)::date+t.horizon_days end) or extract(second from wall)<>0 then raise exception 'This time is unavailable.' using errcode='23P01';end if;
 if not exists(select 1 from jsonb_array_elements(t.availability) w where (w->>'day')::integer=extract(dow from wall) and wall::time>=(w->>'start')::time and (end_at at time zone t.timezone)::date=wall::date and (end_at at time zone t.timezone)::time<=(w->>'end')::time and mod((extract(epoch from (wall::time-(w->>'start')::time))/60)::integer,t.slot_interval_minutes)=0) then raise exception 'This time is unavailable.' using errcode='23P01';end if;
 perform pg_advisory_xact_lock(hashtext(t.owner_id::text)::bigint);
 select coalesce(b.buffer_minutes,30) into shoot_buffer from public.business_settings b where b.id=true;
 if exists(select 1 from public.schedule_blocks b where b.team_member_id=t.owner_id and not b.is_available and start_at-make_interval(mins=>coalesce(t.buffer_before_minutes,t.buffer_minutes))<b.ends_at and end_at+make_interval(mins=>coalesce(t.buffer_after_minutes,t.buffer_minutes))>b.starts_at)
 or exists(select 1 from public.crm_appointments b where b.owner_id=t.owner_id and b.status='confirmed' and start_at-make_interval(mins=>coalesce(t.buffer_before_minutes,t.buffer_minutes))<b.ends_at+make_interval(mins=>coalesce(b.buffer_after_minutes,b.buffer_minutes)) and end_at+make_interval(mins=>coalesce(t.buffer_after_minutes,t.buffer_minutes))>b.starts_at-make_interval(mins=>coalesce(b.buffer_before_minutes,b.buffer_minutes)))
 or exists(select 1 from public.orders o left join public.contractors c on c.id=o.contractor_id where o.status::text not in ('cancelled','draft') and o.scheduled_at is not null and ((coalesce(c.team_member_id,o.photographer_id)=t.owner_id and start_at-make_interval(mins=>coalesce(t.buffer_before_minutes,t.buffer_minutes))<o.scheduled_at+make_interval(mins=>coalesce(o.photographer_start_offset_minutes,0)+coalesce(o.photographer_duration_minutes,o.duration_minutes,60)+coalesce(shoot_buffer,30)) and end_at+make_interval(mins=>coalesce(t.buffer_after_minutes,t.buffer_minutes))>o.scheduled_at+make_interval(mins=>coalesce(o.photographer_start_offset_minutes,0)-coalesce(shoot_buffer,30))) or (o.videographer_id=t.owner_id and start_at-make_interval(mins=>coalesce(t.buffer_before_minutes,t.buffer_minutes))<o.scheduled_at+make_interval(mins=>coalesce(o.videographer_start_offset_minutes,0)+coalesce(o.videographer_duration_minutes,o.duration_minutes,60)+coalesce(shoot_buffer,30)) and end_at+make_interval(mins=>coalesce(t.buffer_after_minutes,t.buffer_minutes))>o.scheduled_at+make_interval(mins=>coalesce(o.videographer_start_offset_minutes,0)-coalesce(shoot_buffer,30))))) then raise exception 'This time was just booked. Choose another.' using errcode='23P01';end if;
 if length(trim(coalesce(p_data->>'full_name',''))) not between 2 and 120 or length(coalesce(p_data->>'email',''))>254 or coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(coalesce(p_data->>'notes',''))>2000 or length(coalesce(p_data->>'phone',''))>50 then raise exception 'Check your contact details.';end if;
 if t.location ~* '^phone($|[^a-z0-9_])' and length(regexp_replace(coalesce(p_data->>'phone',''),'[^0-9]','','g')) not between 7 and 15 then raise exception 'A valid phone number is required for this call.';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_data->>'email')),721));
 select id into cid from public.clients where lower(email)=lower(trim(p_data->>'email')) order by created_at,id limit 1;
 if cid is null then insert into public.clients(full_name,email,phone) values(trim(p_data->>'full_name'),lower(trim(p_data->>'email')),nullif(p_data->>'phone','')) returning id into cid;end if;
 insert into public.crm_contact_profiles(client_id) values(cid) on conflict do nothing;
 select id into sid from public.crm_stages where outcome='open' order by position,id limit 1;
 if sid is null then raise exception 'Inquiry stage missing.';end if;
 insert into public.projects(client_id,name,description,created_by,start_date) values(cid,left(t.name||' — '||trim(p_data->>'full_name'),180),coalesce(p_data->>'notes',''),t.owner_id,case when t.use_session_as_project_date then wall::date else null end) returning id into pid;
 insert into public.crm_opportunities(id,project_id,client_id,title,stage_id,project_type,lead_source,next_follow_up,owner_id,description,project_date) select pid,pid,cid,name,sid,left(t.name,100),'Scheduling link',start_at,t.owner_id,coalesce(p_data->>'notes',''),case when t.use_session_as_project_date then wall::date else null end from public.projects where id=pid;
 insert into public.crm_tasks(id,client_id,project_id,title,owner_id,due_at) values(tid,cid,pid,left('Attend: '||t.name,180),t.owner_id,start_at);
 insert into public.schedule_blocks(id,team_member_id,starts_at,ends_at,reason,is_available) values(bid,t.owner_id,start_at-make_interval(mins=>coalesce(t.buffer_before_minutes,t.buffer_minutes)),end_at+make_interval(mins=>coalesce(t.buffer_after_minutes,t.buffer_minutes)),'crm-session:'||p_id,false);
 insert into public.crm_appointments(id,session_type_id,client_id,project_id,owner_id,title,location,timezone,full_name,email,phone,notes,starts_at,ends_at,buffer_minutes,manage_token,payload_hash,email_consent,task_id,schedule_block_id,buffer_before_minutes,buffer_after_minutes,confirmation_instructions)
 values(p_id,t.id,cid,pid,t.owner_id,t.name,t.location,t.timezone,trim(p_data->>'full_name'),lower(trim(p_data->>'email')),coalesce(p_data->>'phone',''),coalesce(p_data->>'notes',''),start_at,end_at,t.buffer_minutes,p_data->>'manage_token',p_hash,coalesce((p_data->>'email_consent')::boolean,false),tid,bid,coalesce(t.buffer_before_minutes,t.buffer_minutes),coalesce(t.buffer_after_minutes,t.buffer_minutes),t.confirmation_instructions) returning * into a;
 insert into public.crm_events(client_id,project_id,kind,body,details) values(cid,pid,'session_booked','Client scheduled '||t.name,jsonb_build_object('appointment_id',p_id,'starts_at',start_at));
 perform public.crm_enqueue_session_notifications(a.id,1,'confirmation',start_at,a.email_consent);
 return jsonb_build_object('ok',true,'id',a.id,'token',a.manage_token);
end $$;
revoke all on function public.crm_session_commit(uuid,text,text,jsonb,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_session_commit(uuid,text,text,jsonb,integer,timestamptz) to service_role;

create or replace function public.crm_session_change(p_id uuid,p_token text,p_actor uuid,p_action text,p_version integer,p_start timestamptz,p_calendar_checked_at timestamptz,p_type_version integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.crm_appointments%rowtype;t public.crm_session_types%rowtype;end_at timestamptz;wall timestamp;is_office boolean;shoot_buffer integer;
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
  if p_start<now()+make_interval(mins=>t.notice_minutes) or wall::date>(case when t.booking_horizon_months is not null then ((now() at time zone t.timezone)::date+make_interval(months=>t.booking_horizon_months))::date else (now() at time zone t.timezone)::date+t.horizon_days end) or extract(second from wall)<>0 or not exists(select 1 from jsonb_array_elements(t.availability) w where (w->>'day')::integer=extract(dow from wall) and wall::time>=(w->>'start')::time and (end_at at time zone t.timezone)::date=wall::date and (end_at at time zone t.timezone)::time<=(w->>'end')::time and mod((extract(epoch from (wall::time-(w->>'start')::time))/60)::integer,t.slot_interval_minutes)=0) then raise exception 'This time is unavailable.' using errcode='23P01';end if;
  select coalesce(b.buffer_minutes,30) into shoot_buffer from public.business_settings b where b.id=true;
  if exists(select 1 from public.schedule_blocks b where b.id<>a.schedule_block_id and b.team_member_id=a.owner_id and not b.is_available and p_start-make_interval(mins=>coalesce(t.buffer_before_minutes,t.buffer_minutes))<b.ends_at and end_at+make_interval(mins=>coalesce(t.buffer_after_minutes,t.buffer_minutes))>b.starts_at)
  or exists(select 1 from public.crm_appointments b where b.id<>a.id and b.owner_id=a.owner_id and b.status='confirmed' and p_start-make_interval(mins=>coalesce(t.buffer_before_minutes,t.buffer_minutes))<b.ends_at+make_interval(mins=>coalesce(b.buffer_after_minutes,b.buffer_minutes)) and end_at+make_interval(mins=>coalesce(t.buffer_after_minutes,t.buffer_minutes))>b.starts_at-make_interval(mins=>coalesce(b.buffer_before_minutes,b.buffer_minutes)))
  or exists(select 1 from public.orders o left join public.contractors c on c.id=o.contractor_id where o.status::text not in ('cancelled','draft') and o.scheduled_at is not null and ((coalesce(c.team_member_id,o.photographer_id)=a.owner_id and p_start-make_interval(mins=>coalesce(t.buffer_before_minutes,t.buffer_minutes))<o.scheduled_at+make_interval(mins=>coalesce(o.photographer_start_offset_minutes,0)+coalesce(o.photographer_duration_minutes,o.duration_minutes,60)+coalesce(shoot_buffer,30)) and end_at+make_interval(mins=>coalesce(t.buffer_after_minutes,t.buffer_minutes))>o.scheduled_at+make_interval(mins=>coalesce(o.photographer_start_offset_minutes,0)-coalesce(shoot_buffer,30))) or (o.videographer_id=a.owner_id and p_start-make_interval(mins=>coalesce(t.buffer_before_minutes,t.buffer_minutes))<o.scheduled_at+make_interval(mins=>coalesce(o.videographer_start_offset_minutes,0)+coalesce(o.videographer_duration_minutes,o.duration_minutes,60)+coalesce(shoot_buffer,30)) and end_at+make_interval(mins=>coalesce(t.buffer_after_minutes,t.buffer_minutes))>o.scheduled_at+make_interval(mins=>coalesce(o.videographer_start_offset_minutes,0)-coalesce(shoot_buffer,30))))) then raise exception 'This time was just booked. Choose another.' using errcode='23P01';end if;
  update public.crm_appointments set starts_at=p_start,ends_at=end_at,timezone=t.timezone,location=t.location,buffer_minutes=t.buffer_minutes,buffer_before_minutes=coalesce(t.buffer_before_minutes,t.buffer_minutes),buffer_after_minutes=coalesce(t.buffer_after_minutes,t.buffer_minutes),version=version+1,updated_at=now() where id=a.id;
  update public.schedule_blocks set starts_at=p_start-make_interval(mins=>coalesce(t.buffer_before_minutes,t.buffer_minutes)),ends_at=end_at+make_interval(mins=>coalesce(t.buffer_after_minutes,t.buffer_minutes)) where id=a.schedule_block_id;
  update public.crm_tasks set due_at=p_start,version=version+1 where id=a.task_id;
  update public.crm_opportunities set next_follow_up=p_start,version=version+1 where project_id=a.project_id and next_follow_up=a.starts_at;
  if t.use_session_as_project_date then
   update public.projects set start_date=wall::date,updated_at=now() where id=a.project_id and start_date=(a.starts_at at time zone a.timezone)::date;
   update public.crm_opportunities set project_date=wall::date,version=version+1 where project_id=a.project_id and project_date=(a.starts_at at time zone a.timezone)::date;
  end if;
 end if;
 update public.crm_session_notifications set status='cancelled' where appointment_id=a.id and status='pending';
 perform public.crm_enqueue_session_notifications(a.id,a.version+1,case when p_action='cancel' then 'cancelled' else 'rescheduled' end,p_start,a.email_consent);
 insert into public.crm_events(client_id,project_id,actor_id,kind,body,details) values(a.client_id,a.project_id,p_actor,'session_'||p_action,case when p_action='cancel' then 'Session cancelled' else 'Session rescheduled' end,jsonb_build_object('appointment_id',a.id,'previous_starts_at',a.starts_at,'starts_at',p_start));
 return jsonb_build_object('ok',true,'id',a.id);
end $$;
revoke all on function public.crm_session_change(uuid,text,uuid,text,integer,timestamptz,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.crm_session_change(uuid,text,uuid,text,integer,timestamptz,timestamptz,integer) to service_role;
