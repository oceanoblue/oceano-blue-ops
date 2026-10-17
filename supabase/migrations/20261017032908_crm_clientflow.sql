-- Client relationship layer on the existing clients/projects, without duplicating
-- the production, billing, scheduling or delivery ledgers.
create table public.crm_stages (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 80),
 position integer not null default 0, outcome text not null default 'open' check(outcome in ('open','won','lost','archived'))
);
insert into public.crm_stages(name,position,outcome) values ('Inquiry',0,'open'),('Follow-up',10,'open'),('Meeting',20,'open'),('Proposal sent',30,'open'),('Proposal signed',40,'open'),('Retainer paid',50,'won'),('Planning',60,'won'),('Editing',70,'won'),('SEND Gallery',80,'won'),('Completed',90,'won'),('FeedBack',100,'won'),('Archived',110,'archived'),('Lost',120,'lost');
create table public.crm_contact_profiles (
 client_id uuid primary key references public.clients(id) on delete restrict,
 company text not null default '',tags text[] not null default '{}',status text not null default 'lead' check(status in ('lead','client','archived')),
 version integer not null default 1,updated_at timestamptz not null default now()
);
create table public.crm_opportunities (
 id uuid primary key,project_id uuid not null unique references public.projects(id) on delete restrict,
 client_id uuid not null references public.clients(id) on delete restrict,
 title text not null check(length(trim(title)) between 1 and 180),stage_id uuid not null references public.crm_stages(id),
 project_type text not null default '',lead_source text not null default '',value_cents integer not null default 0 check(value_cents>=0),
 project_date date,next_follow_up timestamptz,owner_id uuid references public.team_members(id),
 description text not null default '',lost_reason text not null default '',version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index crm_opportunities_contact_idx on public.crm_opportunities(client_id,created_at desc);
create index crm_opportunities_stage_idx on public.crm_opportunities(stage_id,next_follow_up);
create index crm_opportunities_owner_idx on public.crm_opportunities(owner_id);
create table public.crm_events (
 id uuid primary key default gen_random_uuid(),client_id uuid references public.clients(id) on delete restrict,
 project_id uuid references public.projects(id) on delete restrict,actor_id uuid,
 kind text not null,body text not null default '',details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create index crm_events_contact_idx on public.crm_events(client_id,created_at desc);
create index crm_events_project_idx on public.crm_events(project_id,created_at desc);
create table public.crm_tasks (
 id uuid primary key default gen_random_uuid(),client_id uuid references public.clients(id) on delete restrict,
 project_id uuid references public.projects(id) on delete restrict,title text not null check(length(trim(title)) between 1 and 180),
 owner_id uuid references public.team_members(id),due_at timestamptz,completed_at timestamptz,
 version integer not null default 1,created_at timestamptz not null default now()
);
create index crm_tasks_due_idx on public.crm_tasks(due_at) where completed_at is null;
create index crm_tasks_contact_idx on public.crm_tasks(client_id);
create index crm_tasks_project_idx on public.crm_tasks(project_id);
create index crm_tasks_owner_idx on public.crm_tasks(owner_id);
create table public.crm_forms (
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text not null,title text not null,description text not null default '',published boolean not null default false,
 fields jsonb not null check(jsonb_typeof(fields)='array'),success_message text not null,
 default_project_type text not null default '',owner_id uuid references public.team_members(id),version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index crm_forms_owner_idx on public.crm_forms(owner_id);
create table public.crm_submissions (
 id uuid primary key,form_id uuid not null references public.crm_forms(id) on delete restrict,
 client_id uuid not null references public.clients(id) on delete restrict,project_id uuid not null references public.projects(id) on delete restrict,
 payload_hash text not null,answers jsonb not null,form_snapshot jsonb not null,attribution jsonb not null default '{}',created_at timestamptz not null default now()
);
create index crm_submissions_form_idx on public.crm_submissions(form_id,created_at desc);
create index crm_submissions_contact_idx on public.crm_submissions(client_id);
create index crm_submissions_project_idx on public.crm_submissions(project_id);
create table public.crm_automations (
 id uuid primary key default gen_random_uuid(),name text not null,enabled boolean not null default false,
 trigger text not null check(trigger in ('inquiry_received','stage_changed')),stage_id uuid references public.crm_stages(id),
 task_title text not null check(length(trim(task_title)) between 1 and 180),delay_hours integer not null check(delay_hours between 0 and 8760),created_at timestamptz not null default now()
);
create index crm_automations_stage_idx on public.crm_automations(stage_id);
create table public.crm_imports (id uuid primary key,actor_id uuid not null,result jsonb not null,payload jsonb not null,created_at timestamptz not null default now());

-- The existing auth pool includes clients/photographers. Only active office
-- admins and coordinators may read CRM. Browser writes use guarded server RPCs.
do $$ declare tbl text; begin
 foreach tbl in array array['crm_stages','crm_contact_profiles','crm_opportunities','crm_events','crm_tasks','crm_forms','crm_submissions','crm_automations','crm_imports'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from public,anon,authenticated',tbl);
  execute format('grant select on public.%I to authenticated',tbl);
  execute format('grant select,insert,update on public.%I to service_role',tbl);
  execute format('create policy office_read on public.%I for select to authenticated using (exists(select 1 from public.team_members t where t.id=(select auth.uid()) and t.is_active and t.role::text in (''admin'',''coordinator'')))',tbl);
 end loop;
end $$;
create function public.crm_history_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$ begin raise exception 'CRM history is append-only'; end $$;
revoke all on function public.crm_history_guard() from public;
create trigger crm_events_immutable before update or delete on public.crm_events for each row execute function public.crm_history_guard();
create trigger crm_submissions_immutable before update or delete on public.crm_submissions for each row execute function public.crm_history_guard();
create trigger crm_imports_immutable before update or delete on public.crm_imports for each row execute function public.crm_history_guard();

-- Called only from the service role. The server supplies the actual session's
-- actor; the function independently checks office authorization and commits the
-- business write, project link and activity together.
create function public.crm_action(p_actor uuid,p_action text,p_id uuid,p_version integer,p_data jsonb)
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
 when 'deal_update' then
  select client_id,project_id,version,stage_id into cid,pid,ver,old_stage from public.crm_opportunities where id=p_id for update;
  if not found then return jsonb_build_object('error','Project not found.');end if;
  if ver<>p_version then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
  if cid<>(p_data->>'client_id')::uuid then return jsonb_build_object('error','Project contact cannot be reassigned.');end if;
  update public.crm_opportunities set title=p_data->>'title',stage_id=(p_data->>'stage_id')::uuid,project_type=p_data->>'project_type',lead_source=p_data->>'lead_source',value_cents=(p_data->>'value_cents')::integer,project_date=(p_data->>'project_date')::date,next_follow_up=(p_data->>'next_follow_up')::timestamptz,owner_id=(p_data->>'owner_id')::uuid,description=p_data->>'description',lost_reason=p_data->>'lost_reason',version=version+1,updated_at=now() where id=p_id returning version into ver;
  update public.projects set name=p_data->>'title',description=p_data->>'description',start_date=(p_data->>'project_date')::date,updated_at=now() where id=pid;
  if old_stage<>(p_data->>'stage_id')::uuid then
   insert into public.crm_tasks(client_id,project_id,title,due_at,owner_id) select cid,pid,a.task_title,now()+make_interval(hours=>a.delay_hours),(p_data->>'owner_id')::uuid from public.crm_automations a where a.enabled and a.trigger='stage_changed' and (a.stage_id is null or a.stage_id=(p_data->>'stage_id')::uuid);
  end if;
 when 'note' then
  cid:=(p_data->>'client_id')::uuid;pid:=(p_data->>'project_id')::uuid;
  if pid is not null and not exists(select 1 from public.projects where id=pid and client_id=cid) then return jsonb_build_object('error','Project does not belong to this contact.');end if;
 when 'task_create' then
  cid:=(p_data->>'client_id')::uuid;pid:=(p_data->>'project_id')::uuid;ver:=1;
  if pid is not null and not exists(select 1 from public.projects where id=pid and (cid is null or client_id=cid)) then return jsonb_build_object('error','Project does not belong to this contact.');end if;
  insert into public.crm_tasks(id,client_id,project_id,title,owner_id,due_at) values(p_id,cid,pid,p_data->>'title',(p_data->>'owner_id')::uuid,(p_data->>'due_at')::timestamptz);
 when 'task_update' then
  select client_id,project_id,version into cid,pid,ver from public.crm_tasks where id=p_id for update;
  if not found then return jsonb_build_object('error','Task not found.');end if;
  if ver<>p_version then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
  update public.crm_tasks set completed_at=case when (p_data->>'completed')::boolean then now() else null end,version=version+1 where id=p_id returning version into ver;
 when 'stage_save' then
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

-- Atomic public intake: duplicate retries cannot create duplicate projects or
-- automation tasks, and submissions never overwrite existing contact details.
create function public.crm_submit_inquiry(p_form uuid,p_request uuid,p_hash text,p_answers jsonb,p_attribution jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare f public.crm_forms%rowtype;s public.crm_submissions%rowtype;cid uuid;pid uuid;stage uuid;field jsonb;val text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into s from public.crm_submissions where id=p_request;
 if found then
  if s.form_id<>p_form or s.payload_hash<>p_hash then return jsonb_build_object('error','Submission ID already used.');end if;
  return jsonb_build_object('ok',true);
 end if;
 select * into f from public.crm_forms where id=p_form and published for share;
 if not found then return jsonb_build_object('error','Form unavailable.');end if;
 -- Required fields checked again against the current config in this transaction.
 for field in select * from jsonb_array_elements(f.fields) loop
  val:=trim(coalesce(p_answers->>(field->>'key'),''));
  if (field->>'required')::boolean and val='' then return jsonb_build_object('error','Required field missing.');end if;
  if field->>'type'='select' and val<>'' and not (field->'options' ? val) then return jsonb_build_object('error','Invalid option.');end if;
 end loop;
 if length(trim(coalesce(p_answers->>'full_name',''))) not between 1 and 180 or length(coalesce(p_answers->>'email',''))>254 or coalesce(p_answers->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return jsonb_build_object('error','Invalid contact details.');end if;
 insert into public.clients(full_name,email,phone) values(trim(p_answers->>'full_name'),lower(trim(p_answers->>'email')),nullif(p_answers->>'phone','')) on conflict(email) do nothing returning id into cid;
 if cid is null then
  select id into cid from public.clients where email=lower(trim(p_answers->>'email'));
  insert into public.crm_contact_profiles(client_id,status) values(cid,'client') on conflict do nothing;
 else insert into public.crm_contact_profiles(client_id) values(cid);end if;
 select id into stage from public.crm_stages where outcome='open' order by position,id limit 1;
 if stage is null then raise exception 'Inquiry stage missing';end if;
 insert into public.projects(client_id,name,description) values(cid,left(trim(p_answers->>'full_name')||' — '||coalesce(nullif(p_answers->>'project_type',''),nullif(f.default_project_type,''),'Website inquiry'),180),coalesce(p_answers->>'message','')) returning id into pid;
 insert into public.crm_opportunities(id,project_id,client_id,title,stage_id,project_type,lead_source,project_date,owner_id,description) select pid,pid,cid,name,stage,coalesce(nullif(p_answers->>'project_type',''),f.default_project_type),coalesce(p_answers->>'lead_source','Website'),nullif(p_answers->>'project_date','')::date,f.owner_id,coalesce(p_answers->>'message','') from public.projects where id=pid;
 insert into public.crm_submissions(id,form_id,client_id,project_id,payload_hash,answers,form_snapshot,attribution) values(p_request,p_form,cid,pid,p_hash,p_answers,jsonb_build_object('title',f.title,'fields',f.fields,'version',f.version),p_attribution);
 insert into public.crm_events(client_id,project_id,kind,body,details) values(cid,pid,'inquiry_received','New inquiry from '||f.name,jsonb_build_object('submission_id',p_request,'answers',p_answers,'attribution',p_attribution));
 insert into public.crm_tasks(client_id,project_id,title,owner_id,due_at) select cid,pid,task_title,f.owner_id,now()+make_interval(hours=>delay_hours) from public.crm_automations where enabled and trigger='inquiry_received';
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.crm_submit_inquiry(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.crm_submit_inquiry(uuid,uuid,text,jsonb,jsonb) to service_role;

create function public.crm_report() returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object(
  'contacts',(select count(*) from public.clients),
  'overdue',(select count(*) from public.crm_tasks where completed_at is null and due_at<now()),
  'stages',(select coalesce(jsonb_agg(x order by x.position),'[]') from (select s.id,s.name,s.position,s.outcome,count(o.id)::integer count,coalesce(sum(o.value_cents),0) value_cents from public.crm_stages s left join public.crm_opportunities o on o.stage_id=s.id group by s.id) x),
  'sources',(select coalesce(jsonb_agg(x order by x.count desc),'[]') from (select coalesce(nullif(lead_source,''),'Unknown') name,count(*)::integer count,coalesce(sum(value_cents),0) value_cents from public.crm_opportunities group by 1) x)
 )
$$;
revoke all on function public.crm_report() from public,anon,authenticated;
grant execute on function public.crm_report() to service_role;

-- Parameterized global search and pagination; search terms are literal text,
-- including quotes, percent signs and commas, never PostgREST filter syntax.
create function public.crm_page(p_query text,p_tag text,p_stage uuid,p_owner uuid,p_page integer) returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
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
  from public.crm_opportunities o join public.clients c on c.id=o.client_id
  where (coalesce(p_query,'')='' or strpos(lower(concat_ws(' ',o.title,c.full_name,c.email,o.project_type,o.lead_source)),lower(p_query))>0)
  and (p_stage is null or o.stage_id=p_stage) and (p_owner is null or o.owner_id=p_owner)
  order by o.created_at desc,o.id offset greatest(p_page,0)*100 limit 101
 ) x),
 'tags',(select coalesce(jsonb_agg(t order by t),'[]') from (select distinct unnest(tags) t from public.crm_contact_profiles) tags)
 )
$$;
revoke all on function public.crm_page(text,text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.crm_page(text,text,uuid,uuid,integer) to service_role;

-- Draft only: the website keeps its current HoneyBook embed until cutover.
insert into public.crm_forms(slug,name,title,description,fields,success_message) values('contact','Website contact form','Tell us about your project','We’d love to hear what you have in mind.',$fields$[{"key": "full_name", "label": "Full name", "type": "text", "required": true}, {"key": "email", "label": "Email", "type": "email", "required": true}, {"key": "phone", "label": "Phone number", "type": "tel", "required": false}, {"key": "project_date", "label": "Project date", "type": "date", "required": false}, {"key": "address", "label": "Address", "type": "text", "required": false}, {"key": "project_type", "label": "What type of project are you looking for?", "type": "text", "required": false}, {"key": "guest_count", "label": "Estimated guest count", "type": "number", "required": false}, {"key": "duration", "label": "Estimated time", "type": "text", "required": false}, {"key": "budget", "label": "Budget", "type": "text", "required": false}, {"key": "lead_source", "label": "How did you hear about us?", "type": "text", "required": false}, {"key": "message", "label": "Tell me more about this project", "type": "textarea", "required": false}]$fields$::jsonb,'Your inquiry has been received. Our team will be in touch soon.');
