-- Historical projects belong in the archive, without new follow-up work.
alter table public.crm_tasks add column paused_at timestamptz;
create index crm_tasks_unpaused_due_idx on public.crm_tasks(due_at) where completed_at is null and paused_at is null;
create or replace function public.crm_action(p_actor uuid,p_action text,p_id uuid,p_version integer,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare cid uuid;pid uuid;ver integer; old_stage uuid; item jsonb; result jsonb; added integer:=0;skipped integer:=0; existing public.crm_imports%rowtype;
begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Office access required.');end if;
 if p_data->>'owner_id' is not null and not exists(select 1 from public.team_members where id=(p_data->>'owner_id')::uuid and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Choose an active office owner.');end if;
 case p_action
 when 'contact_create' then
  insert into public.clients(id,full_name,email,phone,brokerage,notes,is_archived,billing_address) values(p_id,trim(p_data->>'full_name'),lower(trim(p_data->>'email')),nullif(p_data->>'phone',''),nullif(p_data->>'company',''),p_data->>'notes',p_data->>'status'='archived',p_data->>'billing_address');
  insert into public.crm_contact_profiles(client_id,company,tags,status) values(p_id,p_data->>'company',array(select jsonb_array_elements_text(p_data->'tags')),p_data->>'status');
  cid:=p_id;ver:=1;
 when 'contact_update' then
  -- Lock the parent even when no profile exists yet (existing Ops clients).
  perform 1 from public.clients where id=p_id for update;
  if not found then return jsonb_build_object('error','Contact not found.');end if;
  insert into public.crm_contact_profiles(client_id,status) values(p_id,'client') on conflict do nothing;
  select version into ver from public.crm_contact_profiles where client_id=p_id for update;
  if ver<>p_version then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
  update public.clients set full_name=trim(p_data->>'full_name'),email=lower(trim(p_data->>'email')),phone=nullif(p_data->>'phone',''),brokerage=nullif(p_data->>'company',''),notes=p_data->>'notes',billing_address=p_data->>'billing_address',is_archived=(p_data->>'status'='archived'),updated_at=now() where id=p_id;
  update public.crm_contact_profiles set company=p_data->>'company',tags=array(select jsonb_array_elements_text(p_data->'tags')),status=p_data->>'status',version=version+1,updated_at=now() where client_id=p_id returning version into ver;
  cid:=p_id;
 when 'deal_create' then
  cid:=(p_data->>'client_id')::uuid;pid:=p_id;ver:=1;
  insert into public.projects(id,client_id,name,description,start_date,created_by) values(pid,cid,p_data->>'title',p_data->>'description',(p_data->>'project_date')::date,p_actor);
  insert into public.crm_opportunities(id,project_id,client_id,title,stage_id,project_type,lead_source,value_cents,project_date,next_follow_up,owner_id,description,lost_reason) values(p_id,pid,cid,p_data->>'title',(p_data->>'stage_id')::uuid,p_data->>'project_type',p_data->>'lead_source',(p_data->>'value_cents')::integer,(p_data->>'project_date')::date,(p_data->>'next_follow_up')::timestamptz,(p_data->>'owner_id')::uuid,p_data->>'description',p_data->>'lost_reason');
  if exists(select 1 from public.crm_stages where id=(p_data->>'stage_id')::uuid and outcome='archived') then update public.projects set status='archived' where id=pid;update public.crm_opportunities set next_follow_up=null where id=p_id;end if;
 when 'deal_update' then
  select client_id,project_id,version,stage_id into cid,pid,ver,old_stage from public.crm_opportunities where id=p_id for update;
  if not found then return jsonb_build_object('error','Project not found.');end if;
  if ver<>p_version then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
  if cid<>(p_data->>'client_id')::uuid then return jsonb_build_object('error','Project contact cannot be reassigned.');end if;
  update public.crm_opportunities set title=p_data->>'title',stage_id=(p_data->>'stage_id')::uuid,project_type=p_data->>'project_type',lead_source=p_data->>'lead_source',value_cents=(p_data->>'value_cents')::integer,project_date=(p_data->>'project_date')::date,next_follow_up=case when exists(select 1 from public.crm_stages where id=(p_data->>'stage_id')::uuid and outcome='archived') then null else (p_data->>'next_follow_up')::timestamptz end,owner_id=(p_data->>'owner_id')::uuid,description=p_data->>'description',lost_reason=p_data->>'lost_reason',version=version+1,updated_at=now() where id=p_id returning version into ver;
  update public.projects set name=p_data->>'title',description=p_data->>'description',start_date=(p_data->>'project_date')::date,status=case when exists(select 1 from public.crm_stages where id=(p_data->>'stage_id')::uuid and outcome='archived') then 'archived' when exists(select 1 from public.crm_stages where id=old_stage and outcome='archived') then 'active' else status end,updated_at=now() where id=pid;
  if exists(select 1 from public.crm_stages where id=(p_data->>'stage_id')::uuid and outcome='archived') then update public.crm_tasks set paused_at=coalesce(paused_at,now()),version=version+1 where project_id=pid and completed_at is null and paused_at is null;end if;
  if old_stage<>(p_data->>'stage_id')::uuid and not exists(select 1 from public.crm_stages where id=(p_data->>'stage_id')::uuid and outcome='archived') then
   insert into public.crm_tasks(client_id,project_id,title,due_at,owner_id) select cid,pid,a.task_title,now()+make_interval(hours=>a.delay_hours),(p_data->>'owner_id')::uuid from public.crm_automations a where a.enabled and a.trigger='stage_changed' and (a.stage_id is null or a.stage_id=(p_data->>'stage_id')::uuid);
  end if;
 when 'note' then
  cid:=(p_data->>'client_id')::uuid;pid:=(p_data->>'project_id')::uuid;
  if pid is not null and not exists(select 1 from public.projects where id=pid and client_id=cid) then return jsonb_build_object('error','Project does not belong to this contact.');end if;
 when 'task_create' then
  cid:=(p_data->>'client_id')::uuid;pid:=(p_data->>'project_id')::uuid;ver:=1;
  if pid is not null and not exists(select 1 from public.projects where id=pid and (cid is null or client_id=cid)) then return jsonb_build_object('error','Project does not belong to this contact.');end if;
  perform 1 from public.crm_opportunities where project_id=pid for update;
  if exists(select 1 from public.crm_opportunities o join public.crm_stages s on s.id=o.stage_id where o.project_id=pid and s.outcome='archived') then return jsonb_build_object('error','Reopen the project before adding a follow-up task.');end if;
  insert into public.crm_tasks(id,client_id,project_id,title,owner_id,due_at) values(p_id,cid,pid,p_data->>'title',(p_data->>'owner_id')::uuid,(p_data->>'due_at')::timestamptz);
 when 'task_update' then
  select client_id,project_id,version into cid,pid,ver from public.crm_tasks where id=p_id for update;
  if not found then return jsonb_build_object('error','Task not found.');end if;
  if ver<>p_version then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
  update public.crm_tasks set completed_at=case when (p_data->>'completed')::boolean then now() else null end,version=version+1 where id=p_id returning version into ver;
 when 'stage_save' then
  if exists(select 1 from public.crm_stages s where s.id=p_id and s.outcome<>p_data->>'outcome' and (s.outcome='archived' or p_data->>'outcome'='archived')) and exists(select 1 from public.crm_opportunities where stage_id=p_id) then return jsonb_build_object('error','Move projects out of this stage before changing its archive outcome.');end if;
  insert into public.crm_stages(id,name,position,outcome) values(p_id,p_data->>'name',(p_data->>'position')::integer,p_data->>'outcome') on conflict(id) do update set name=excluded.name,position=excluded.position,outcome=excluded.outcome;
 when 'form_save' then
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select version into ver from public.crm_forms where id=p_id for update;
  if (found and ver<>p_version) or (not found and p_version<>0) then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
  insert into public.crm_forms(id,slug,name,title,description,published,fields,success_message,default_project_type,owner_id) values(p_id,p_data->>'slug',p_data->>'name',p_data->>'title',p_data->>'description',(p_data->>'published')::boolean,p_data->'fields',p_data->>'success_message',p_data->>'default_project_type',(p_data->>'owner_id')::uuid)
  on conflict(id) do update set slug=excluded.slug,name=excluded.name,title=excluded.title,description=excluded.description,published=excluded.published,fields=excluded.fields,success_message=excluded.success_message,default_project_type=excluded.default_project_type,owner_id=excluded.owner_id,version=crm_forms.version+1,updated_at=now() returning version into ver;
 when 'automation_save' then
  insert into public.crm_automations(id,name,enabled,trigger,stage_id,task_title,delay_hours) values(p_id,p_data->>'name',(p_data->>'enabled')::boolean,p_data->>'trigger',(p_data->>'stage_id')::uuid,p_data->>'task_title',(p_data->>'delay_hours')::integer)
  on conflict(id) do update set name=excluded.name,enabled=excluded.enabled,trigger=excluded.trigger,stage_id=excluded.stage_id,task_title=excluded.task_title,delay_hours=excluded.delay_hours;
 when 'import' then
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into existing from public.crm_imports where id=p_id;
  if found then if existing.actor_id<>p_actor or existing.payload<>p_data then return jsonb_build_object('error','Import ID already used.');end if;return existing.result;end if;
  if jsonb_array_length(p_data->'contacts') not between 1 and 500 then return jsonb_build_object('error','Import 1–500 contacts at a time.');end if;
  for item in select * from jsonb_array_elements(p_data->'contacts') loop
   cid:=null;
   insert into public.clients(full_name,email,phone,brokerage,notes,billing_address) values(item->>'full_name',lower(trim(item->>'email')),nullif(item->>'phone',''),nullif(item->>'company',''),item->>'notes',item->>'billing_address') on conflict(email) do nothing returning id into cid;
   if cid is not null then
    insert into public.crm_contact_profiles(client_id,company,tags,status) values(cid,item->>'company',array(select jsonb_array_elements_text(item->'tags')),item->>'status');added:=added+1;
    insert into public.crm_events(client_id,actor_id,kind,body) values(cid,p_actor,'contact_imported','Imported contact from CSV');
   else skipped:=skipped+1;end if;
  end loop;
  result:=jsonb_build_object('id',p_id,'added',added,'skipped',skipped);
  insert into public.crm_imports(id,actor_id,result,payload) values(p_id,p_actor,result,p_data);return result;
 else return jsonb_build_object('error','Unknown action.');
 end case;
 insert into public.crm_events(client_id,project_id,actor_id,kind,body,details) values(cid,pid,p_actor,p_action,case when p_action='note' then p_data->>'body' else replace(p_action,'_',' ') end,jsonb_build_object('record_id',p_id,'version',ver,'previous_stage',old_stage,'stage_id',p_data->>'stage_id'));
 return jsonb_build_object('id',p_id,'version',ver);
end $$;
revoke all on function public.crm_action(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.crm_action(uuid,text,uuid,integer,jsonb) to service_role;

create or replace function public.crm_report() returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object(
  'contacts',(select count(*) from public.clients),
  'overdue',(select count(*) from public.crm_tasks where completed_at is null and paused_at is null and due_at<now()),
  'stages',(select coalesce(jsonb_agg(x order by x.position),'[]') from (select s.id,s.name,s.position,s.outcome,count(o.id)::integer count,coalesce(sum(o.value_cents),0) value_cents from public.crm_stages s left join public.crm_opportunities o on o.stage_id=s.id group by s.id) x),
  'sources',(select coalesce(jsonb_agg(x order by x.count desc),'[]') from (select coalesce(nullif(lead_source,''),'Unknown') name,count(*)::integer count,coalesce(sum(value_cents),0) value_cents from public.crm_opportunities o where not exists(select 1 from public.crm_stages s where s.id=o.stage_id and s.outcome='archived') group by 1) x)
 )
$$;
revoke all on function public.crm_report() from public,anon,authenticated;
grant execute on function public.crm_report() to service_role;


create table public.crm_honeybook_projects (
 source_id text primary key check(length(source_id) between 1 and 150),
 project_id uuid not null unique references public.projects(id) on delete restrict,
 original_stage text not null default '',source_snapshot jsonb not null,imported_at timestamptz not null default now()
);
alter table public.crm_honeybook_projects enable row level security;
create policy office_read on public.crm_honeybook_projects for select to authenticated using(exists(select 1 from public.team_members t where t.id=(select auth.uid()) and t.is_active and t.role::text in ('admin','coordinator')));
revoke all on public.crm_honeybook_projects from public,anon,authenticated;
grant select on public.crm_honeybook_projects to authenticated;
grant select,insert on public.crm_honeybook_projects to service_role;
create trigger crm_honeybook_projects_immutable before update or delete on public.crm_honeybook_projects for each row execute function public.crm_history_guard();

create function public.crm_import_honeybook_projects(p_actor uuid,p_id uuid,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare item jsonb;cid uuid;pid uuid;archive_stage uuid;added integer:=0;skipped integer:=0;result jsonb;existing public.crm_imports%rowtype;
begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Office access required.');end if;
 if jsonb_typeof(p_data->'projects') is distinct from 'array' or jsonb_array_length(p_data->'projects') not between 1 and 500 then return jsonb_build_object('error','Import 1–500 historical projects at a time.');end if;
 -- Serializes historical imports, including overlapping batches, so source IDs
 -- and case-insensitive contact matching stay deterministic across requests.
 perform pg_advisory_xact_lock(hashtextextended('crm-honeybook-project-import',0));
 select * into existing from public.crm_imports where id=p_id;
 if found then
  if existing.actor_id<>p_actor or existing.payload<>p_data then return jsonb_build_object('error','Import ID already used.');end if;
  return existing.result;
 end if;
 select id into archive_stage from public.crm_stages where outcome='archived' order by position,id limit 1;
 if archive_stage is null then return jsonb_build_object('error','Create an Archived stage before importing.');end if;
 for item in select * from jsonb_array_elements(p_data->'projects') loop
  if length(trim(coalesce(item->>'source_id',''))) not between 1 and 150 or length(trim(coalesce(item->>'title',''))) not between 1 and 180 or length(trim(coalesce(item->>'client_name',''))) not between 1 and 180 or coalesce(item->>'client_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid historical project data';end if;
  if exists(select 1 from public.crm_honeybook_projects where source_id=item->>'source_id') then skipped:=skipped+1;continue;end if;
  cid:=null;
  insert into public.clients(full_name,email) values(trim(item->>'client_name'),lower(trim(item->>'client_email'))) on conflict(email) do nothing returning id into cid;
  if cid is null then select id into cid from public.clients where lower(email::text)=lower(trim(item->>'client_email'));end if;
  insert into public.crm_contact_profiles(client_id,status) values(cid,'client') on conflict do nothing;
  insert into public.projects(client_id,name,status,description,start_date,created_by,metadata)
   values(cid,item->>'title','archived',coalesce(item->>'description',''),nullif(item->>'project_date','')::date,p_actor,jsonb_build_object('source','honeybook','source_id',item->>'source_id','original_stage',coalesce(item->>'original_stage',''),'archive_reason','Historical HoneyBook migration')) returning id into pid;
  insert into public.crm_opportunities(id,project_id,client_id,title,stage_id,project_type,lead_source,value_cents,project_date,description,next_follow_up,owner_id)
   values(pid,pid,cid,item->>'title',archive_stage,coalesce(item->>'project_type',''),coalesce(item->>'lead_source',''),coalesce((item->>'value_cents')::integer,0),nullif(item->>'project_date','')::date,coalesce(item->>'description',''),null,null);
  insert into public.crm_honeybook_projects(source_id,project_id,original_stage,source_snapshot) values(item->>'source_id',pid,coalesce(item->>'original_stage',''),item);
  insert into public.crm_events(client_id,project_id,actor_id,kind,body,details) values(cid,pid,p_actor,'historical_project_import','Imported HoneyBook project into Archived (original stage: '||coalesce(nullif(item->>'original_stage',''),'Unknown')||')',jsonb_build_object('source_id',item->>'source_id','original_stage',item->>'original_stage','archive_reason','Historical HoneyBook migration'));
  added:=added+1;
 end loop;
 result:=jsonb_build_object('id',p_id,'added',added,'skipped',skipped,'destination','archived');
 insert into public.crm_imports(id,actor_id,result,payload) values(p_id,p_actor,result,p_data);
 return result;
end $$;
revoke all on function public.crm_import_honeybook_projects(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_import_honeybook_projects(uuid,uuid,jsonb) to service_role;

-- The default pipeline excludes archived history; selecting Archived retrieves it.
create or replace function public.crm_page(p_query text,p_tag text,p_stage uuid,p_owner uuid,p_page integer) returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object(
 'contacts',(select coalesce(jsonb_agg(x order by x.full_name,x.id),'[]') from (
  select c.id,c.full_name,c.email,c.phone,c.billing_address,c.brokerage,c.notes,to_jsonb(p)-'client_id' crm_contact_profiles
  from public.clients c left join public.crm_contact_profiles p on p.client_id=c.id
  where (coalesce(p_query,'')='' or strpos(lower(concat_ws(' ',c.full_name,c.email,c.phone,c.brokerage,array_to_string(p.tags,' '))),lower(p_query))>0)
  and (coalesce(p_tag,'')='' or p_tag=any(p.tags))
  order by c.full_name,c.id offset greatest(p_page,0)*100 limit 101
 ) x),
 'deals',(select coalesce(jsonb_agg(x order by x.created_at desc,x.id),'[]') from (
  select o.*,jsonb_build_object('full_name',c.full_name,'email',c.email) clients
  from public.crm_opportunities o join public.clients c on c.id=o.client_id join public.crm_stages s on s.id=o.stage_id
  where (p_stage is not null or s.outcome<>'archived') and (coalesce(p_query,'')='' or strpos(lower(concat_ws(' ',o.title,c.full_name,c.email,o.project_type,o.lead_source)),lower(p_query))>0)
  and (p_stage is null or o.stage_id=p_stage) and (p_owner is null or o.owner_id=p_owner)
  order by o.created_at desc,o.id offset greatest(p_page,0)*100 limit 101
 ) x),
 'tags',(select coalesce(jsonb_agg(t order by t),'[]') from (select distinct unnest(tags) t from public.crm_contact_profiles) tags)
 )
$$;
revoke all on function public.crm_page(text,text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.crm_page(text,text,uuid,uuid,integer) to service_role;
