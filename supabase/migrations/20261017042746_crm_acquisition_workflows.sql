-- Inquiry acquisition: frozen email payloads, review/approval, scheduled sends,
-- scoped client files and an append-only response record. No existing inquiry
-- is enrolled and every starter remains disabled.
create table public.crm_message_templates (
 id uuid primary key, name text not null,subject text not null,body text not null,ready boolean not null default false,
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.crm_file_templates (
 id uuid primary key,name text not null,title text not null,description text not null default '',blocks jsonb not null check(jsonb_typeof(blocks)='array'),ready boolean not null default false,
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.crm_sequences (
 id uuid primary key,name text not null,form_id uuid not null references public.crm_forms(id),enabled boolean not null default false,
 timezone text not null default 'America/New_York',steps jsonb not null check(jsonb_typeof(steps)='array' and jsonb_array_length(steps) between 1 and 12),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index crm_sequences_form_idx on public.crm_sequences(form_id);
create table public.crm_outreach_controls (
 project_id uuid primary key references public.projects(id),paused_at timestamptz not null default now(),reason text not null,actor_id uuid
);
create table public.crm_issued_files (
 id uuid primary key default gen_random_uuid(),template_id uuid not null references public.crm_file_templates(id),
 project_id uuid not null references public.projects(id),client_id uuid not null references public.clients(id),
 access_token text not null unique default replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
 title text not null,snapshot jsonb not null,context jsonb not null,created_by uuid,expires_at timestamptz not null default now()+interval '30 days',
 viewed_at timestamptz,responded_at timestamptz,revoked_at timestamptz,created_at timestamptz not null default now()
);
create index crm_issued_files_template_idx on public.crm_issued_files(template_id);
create index crm_issued_files_project_idx on public.crm_issued_files(project_id,created_at desc);
create index crm_issued_files_client_idx on public.crm_issued_files(client_id,created_at desc);
create table public.crm_file_responses (
 id uuid primary key,file_id uuid not null unique references public.crm_issued_files(id),payload_hash text not null,answers jsonb not null,created_at timestamptz not null default now()
);
create table public.crm_acquisition_jobs (
 id uuid primary key default gen_random_uuid(),sequence_id uuid references public.crm_sequences(id),submission_id uuid references public.crm_submissions(id),step_id uuid,
 project_id uuid not null references public.projects(id),client_id uuid not null references public.clients(id),file_id uuid references public.crm_issued_files(id),
 request_payload jsonb,recipient text not null,subject text not null,body text not null,context jsonb not null,
 status text not null check(status in ('needs_approval','queued','leased','sending','accepted','blocked','needs_review','cancelled')),
 due_at timestamptz not null,first_attempt_at timestamptz,lease_token uuid,locked_at timestamptz,attempts integer not null default 0,
 approved_by uuid,provider_id text,last_error text,accepted_at timestamptz,created_at timestamptz not null default now(),
 unique(submission_id,sequence_id,step_id)
);
create index crm_acquisition_due_idx on public.crm_acquisition_jobs(due_at) where status in ('queued','leased','sending');
create index crm_acquisition_project_idx on public.crm_acquisition_jobs(project_id,created_at desc);
create index crm_acquisition_client_idx on public.crm_acquisition_jobs(client_id,created_at desc);
create index crm_acquisition_file_idx on public.crm_acquisition_jobs(file_id);
create index crm_acquisition_sequence_idx on public.crm_acquisition_jobs(sequence_id);
-- Tokens and frozen send content are never exposed through a public Data API.
do $$ declare tbl text; begin
 foreach tbl in array array['crm_message_templates','crm_file_templates','crm_sequences','crm_outreach_controls','crm_issued_files','crm_file_responses','crm_acquisition_jobs'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from public,anon,authenticated',tbl);
  execute format('grant select on public.%I to authenticated',tbl);
  execute format('grant select,insert,update on public.%I to service_role',tbl);
  execute format('create policy office_read on public.%I for select to authenticated using(exists(select 1 from public.team_members t where t.id=(select auth.uid()) and t.is_active and t.role::text in (''admin'',''coordinator'')))',tbl);
 end loop;
end $$;
create trigger crm_file_responses_immutable before update or delete on public.crm_file_responses for each row execute function public.crm_history_guard();
create function public.crm_file_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if old.id<>new.id or old.access_token<>new.access_token or old.snapshot<>new.snapshot or old.context<>new.context or old.client_id<>new.client_id or old.project_id<>new.project_id or old.template_id<>new.template_id or old.title<>new.title or old.created_at<>new.created_at or old.expires_at<>new.expires_at or old.created_by is distinct from new.created_by then raise exception 'Issued file content is immutable';end if;
 if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then raise exception 'A revoked file cannot be reopened';end if;
 if old.responded_at is not null and new.responded_at is distinct from old.responded_at then raise exception 'A file response is immutable';end if;
 return new;
end $$;
revoke all on function public.crm_file_immutable() from public,anon,authenticated;
create trigger crm_issued_content_guard before update on public.crm_issued_files for each row execute function public.crm_file_immutable();
create function public.crm_mail_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if old.id<>new.id or old.project_id<>new.project_id or old.client_id<>new.client_id or old.recipient<>new.recipient or old.subject<>new.subject or old.body<>new.body or old.context<>new.context or old.file_id is distinct from new.file_id or old.sequence_id is distinct from new.sequence_id or old.submission_id is distinct from new.submission_id or old.step_id is distinct from new.step_id or old.request_payload is distinct from new.request_payload or old.created_at<>new.created_at then raise exception 'Queued email content is immutable';end if;
 if old.first_attempt_at is not null and old.first_attempt_at is distinct from new.first_attempt_at then raise exception 'The first send attempt is immutable';end if;
 if old.status='accepted' and (new.status<>'accepted' or old.provider_id is distinct from new.provider_id or old.accepted_at is distinct from new.accepted_at) then raise exception 'Accepted email history is immutable';end if;
 return new;
end $$;
revoke all on function public.crm_mail_immutable() from public,anon,authenticated;
create trigger crm_mail_content_guard before update on public.crm_acquisition_jobs for each row execute function public.crm_mail_immutable();
create function public.crm_due_at(p_start timestamptz,p_amount integer,p_unit text,p_zone text) returns timestamptz language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare local_time timestamp;days_added integer:=0;
begin
 if p_amount not between 0 and 365 or p_unit not in ('hours','business_days') then raise exception 'Invalid workflow delay';end if;
 if p_unit='hours' then return p_start+make_interval(hours=>p_amount);end if;
 local_time:=p_start at time zone p_zone;
 while days_added<p_amount loop local_time:=local_time+interval '1 day';if extract(isodow from local_time)<6 then days_added:=days_added+1;end if;end loop;
 return local_time at time zone p_zone;
end $$;
revoke all on function public.crm_due_at(timestamptz,integer,text,text) from public,anon,authenticated;
grant execute on function public.crm_due_at(timestamptz,integer,text,text) to service_role;

create function public.crm_enqueue_acquisition() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare seq public.crm_sequences%rowtype;step jsonb;msg public.crm_message_templates%rowtype;ft public.crm_file_templates%rowtype;ctx jsonb;fid uuid;due timestamptz;owner uuid;
begin
 select jsonb_build_object('client_name',c.full_name,'first_name',split_part(c.full_name,' ',1),'project_name',o.title,'project_type',o.project_type),o.owner_id into ctx,owner from public.crm_opportunities o join public.clients c on c.id=o.client_id join public.crm_stages s on s.id=o.stage_id where o.project_id=new.project_id and s.outcome='open' and not coalesce(c.is_archived,false);
 if ctx is null then return new;end if;
 for seq in select * from public.crm_sequences where enabled and form_id=new.form_id loop
  for step in select * from jsonb_array_elements(seq.steps) loop
   due:=public.crm_due_at(new.created_at,(step->>'delay')::integer,step->>'unit',seq.timezone);
   if step->>'kind'='task' then
    insert into public.crm_tasks(client_id,project_id,title,owner_id,due_at) values(new.client_id,new.project_id,step->>'task_title',owner,due);
   else
    select * into msg from public.crm_message_templates where id=(step->>'message_template_id')::uuid and ready;
    if not found then continue;end if;
    fid:=null;
    if nullif(step->>'file_template_id','') is not null then
     select * into ft from public.crm_file_templates where id=(step->>'file_template_id')::uuid and ready;
     if not found then continue;end if;
     insert into public.crm_issued_files(template_id,project_id,client_id,title,snapshot,context,expires_at) values(ft.id,new.project_id,new.client_id,ft.title,to_jsonb(ft),ctx,due+interval '30 days') returning id into fid;
    end if;
    insert into public.crm_acquisition_jobs(sequence_id,submission_id,step_id,project_id,client_id,file_id,recipient,subject,body,context,status,due_at)
    values(seq.id,new.id,(step->>'id')::uuid,new.project_id,new.client_id,fid,new.answers->>'email',msg.subject,msg.body,ctx,case when coalesce((step->>'requires_approval')::boolean,true) then 'needs_approval' else 'queued' end,due);
   end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function public.crm_enqueue_acquisition() from public,anon,authenticated;
create trigger crm_inquiry_acquisition after insert on public.crm_submissions for each row execute function public.crm_enqueue_acquisition();

create function public.crm_acquisition_action(p_actor uuid,p_action text,p_id uuid,p_version integer,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare ver integer;step jsonb;cid uuid;pid uuid;ft public.crm_file_templates%rowtype;msg public.crm_message_templates%rowtype;ctx jsonb;old_job public.crm_acquisition_jobs%rowtype;fid uuid;st text;
begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Office access required.');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,11));
 case p_action
 when 'message_template_save' then
  select version into ver from public.crm_message_templates where id=p_id for update;
  if (found and ver<>p_version) or (not found and p_version<>0) then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
  insert into public.crm_message_templates(id,name,subject,body,ready) values(p_id,p_data->>'name',p_data->>'subject',p_data->>'body',(p_data->>'ready')::boolean)
  on conflict(id) do update set name=excluded.name,subject=excluded.subject,body=excluded.body,ready=excluded.ready,version=crm_message_templates.version+1,updated_at=now() returning version into ver;
 when 'file_template_save' then
  select version into ver from public.crm_file_templates where id=p_id for update;
  if (found and ver<>p_version) or (not found and p_version<>0) then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
  insert into public.crm_file_templates(id,name,title,description,blocks,ready) values(p_id,p_data->>'name',p_data->>'title',p_data->>'description',p_data->'blocks',(p_data->>'ready')::boolean)
  on conflict(id) do update set name=excluded.name,title=excluded.title,description=excluded.description,blocks=excluded.blocks,ready=excluded.ready,version=crm_file_templates.version+1,updated_at=now() returning version into ver;
 when 'sequence_save' then
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_data->>'timezone') then return jsonb_build_object('error','Choose a valid business timezone.');end if;
  if not exists(select 1 from public.crm_forms where id=(p_data->>'form_id')::uuid) then return jsonb_build_object('error','Contact form not found.');end if;
  if jsonb_array_length(p_data->'steps') not between 1 and 12 then return jsonb_build_object('error','Add 1–12 steps.');end if;
  for step in select * from jsonb_array_elements(p_data->'steps') loop
   if step->>'kind'='email' then
    perform 1 from public.crm_message_templates where id=(step->>'message_template_id')::uuid and (ready or not (p_data->>'enabled')::boolean) for share;
    if not found then return jsonb_build_object('error','Mark each email template ready before enabling this workflow.');end if;
    if nullif(step->>'file_template_id','') is not null then
     perform 1 from public.crm_file_templates where id=(step->>'file_template_id')::uuid and (ready or not (p_data->>'enabled')::boolean) for share;
     if not found then return jsonb_build_object('error','Mark each smart-file template ready before enabling this workflow.');end if;
    end if;
   end if;
  end loop;
  select version into ver from public.crm_sequences where id=p_id for update;
  if (found and ver<>p_version) or (not found and p_version<>0) then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
  insert into public.crm_sequences(id,name,form_id,enabled,timezone,steps) values(p_id,p_data->>'name',(p_data->>'form_id')::uuid,(p_data->>'enabled')::boolean,p_data->>'timezone',p_data->'steps')
  on conflict(id) do update set name=excluded.name,form_id=excluded.form_id,enabled=excluded.enabled,timezone=excluded.timezone,steps=excluded.steps,version=crm_sequences.version+1,updated_at=now() returning version into ver;
  if not (p_data->>'enabled')::boolean then update public.crm_acquisition_jobs set status='cancelled',last_error='Workflow paused.' where sequence_id=p_id and status in ('queued','needs_approval','leased');end if;
 when 'issue_file' then
  select * into old_job from public.crm_acquisition_jobs where id=p_id;
  if found then
   if old_job.approved_by is distinct from p_actor or old_job.request_payload is distinct from p_data then return jsonb_build_object('error','Request ID already used.');end if;
   return jsonb_build_object('id',p_id,'file_id',old_job.file_id);
  end if;
  pid:=(p_data->>'project_id')::uuid;
  select o.client_id,jsonb_build_object('client_name',c.full_name,'first_name',split_part(c.full_name,' ',1),'project_name',o.title,'project_type',o.project_type),c.email into cid,ctx,st from public.crm_opportunities o join public.clients c on c.id=o.client_id join public.crm_stages s on s.id=o.stage_id where o.project_id=pid and s.outcome='open' and not coalesce(c.is_archived,false) for update of o;
  if cid is null then return jsonb_build_object('error','Choose an open project for an active contact.');end if;
  select * into ft from public.crm_file_templates where id=(p_data->>'file_template_id')::uuid and ready;
  if not found then return jsonb_build_object('error','Choose a ready smart-file template.');end if;
  select * into msg from public.crm_message_templates where id=(p_data->>'message_template_id')::uuid and ready;
  if not found then return jsonb_build_object('error','Choose a ready email template.');end if;
  insert into public.crm_issued_files(template_id,project_id,client_id,title,snapshot,context,created_by) values(ft.id,pid,cid,ft.title,to_jsonb(ft),ctx,p_actor) returning id into fid;
  insert into public.crm_acquisition_jobs(id,project_id,client_id,file_id,recipient,subject,body,context,status,due_at,approved_by,request_payload) values(p_id,pid,cid,fid,st,msg.subject,msg.body,ctx,'queued',now(),p_actor,p_data);
 when 'job_approve' then
  update public.crm_acquisition_jobs set status='queued',approved_by=p_actor where id=p_id and status='needs_approval' returning client_id,project_id into cid,pid;
  if not found then return jsonb_build_object('error','This email is no longer awaiting approval.');end if;
 when 'job_retry' then
  update public.crm_acquisition_jobs set status='queued',due_at=now(),last_error=null,lease_token=null,locked_at=null where id=p_id and status='blocked' and first_attempt_at is null returning client_id,project_id into cid,pid;
  if not found then return jsonb_build_object('error','Only an email with no previous send attempt can be retried.');end if;
 when 'job_cancel' then
  update public.crm_acquisition_jobs set status='cancelled',last_error='Cancelled by the office.' where id=p_id and status in ('needs_approval','queued','leased','blocked','needs_review') returning client_id,project_id into cid,pid;
  if not found then return jsonb_build_object('error','An accepted or in-flight email cannot be cancelled.');end if;
 when 'project_pause' then
  select client_id into cid from public.crm_opportunities where project_id=p_id for update;
  if not found then return jsonb_build_object('error','Project not found.');end if;pid:=p_id;
  insert into public.crm_outreach_controls(project_id,reason,actor_id) values(pid,p_data->>'reason',p_actor) on conflict(project_id) do update set paused_at=now(),reason=excluded.reason,actor_id=p_actor;
  update public.crm_acquisition_jobs set status='cancelled',last_error='Follow-ups stopped by the office.' where project_id=pid and status in ('needs_approval','queued','leased','blocked','needs_review');
 when 'file_revoke' then
  update public.crm_issued_files set revoked_at=coalesce(revoked_at,now()) where id=p_id returning project_id,client_id into pid,cid;
  if not found then return jsonb_build_object('error','File not found.');end if;
  update public.crm_acquisition_jobs set status='cancelled',last_error='File revoked.' where file_id=p_id and status in ('needs_approval','queued','leased');
 else return jsonb_build_object('error','Unknown action.');
 end case;
 if p_action in ('message_template_save','file_template_save') and not (p_data->>'ready')::boolean then
  update public.crm_sequences s set enabled=false,version=version+1,updated_at=now() where enabled and exists(select 1 from jsonb_array_elements(s.steps) x(value) where (p_action='message_template_save' and x.value->>'message_template_id'=p_id::text) or (p_action='file_template_save' and x.value->>'file_template_id'=p_id::text));
  update public.crm_acquisition_jobs j set status='cancelled',last_error='A workflow template was returned to draft.' where j.sequence_id is not null and j.status in ('queued','needs_approval','leased') and not exists(select 1 from public.crm_sequences s where s.id=j.sequence_id and s.enabled);
 end if;
 insert into public.crm_events(client_id,project_id,actor_id,kind,body,details) values(cid,pid,p_actor,p_action,replace(p_action,'_',' '),jsonb_build_object('record_id',p_id,'version',ver));
 return jsonb_build_object('id',p_id,'version',ver,'file_id',fid);
end $$;
revoke all on function public.crm_acquisition_action(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.crm_acquisition_action(uuid,text,uuid,integer,jsonb) to service_role;

-- Archive/win/loss and contact archival stop queued outreach. An email already
-- handed to the provider cannot be recalled. Historical imports never enroll.
create function public.crm_stop_outreach() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if tg_table_name='crm_opportunities' then
  if new.stage_id is distinct from old.stage_id and exists(select 1 from public.crm_stages where id=new.stage_id and outcome<>'open') then
   insert into public.crm_outreach_controls(project_id,reason) values(new.project_id,'Project left the open pipeline.') on conflict(project_id) do nothing;
   update public.crm_acquisition_jobs set status='cancelled',last_error='Project left the open pipeline.' where project_id=new.project_id and status in ('queued','needs_approval','leased');
  end if;
 else
  if coalesce(new.is_archived,false) and not coalesce(old.is_archived,false) then update public.crm_acquisition_jobs set status='cancelled',last_error='Contact archived.' where client_id=new.id and status in ('queued','needs_approval','leased');end if;
 end if;return new;
end $$;
revoke all on function public.crm_stop_outreach() from public,anon,authenticated;
create trigger crm_project_stop_outreach after update of stage_id on public.crm_opportunities for each row execute function public.crm_stop_outreach();
create trigger crm_contact_stop_outreach after update of is_archived on public.clients for each row execute function public.crm_stop_outreach();

create function public.crm_claim_acquisition(p_limit integer default 5) returns setof public.crm_acquisition_jobs language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.crm_acquisition_jobs set status='queued',lease_token=null,locked_at=null where status='leased' and locked_at<now()-interval '5 minutes';
 update public.crm_acquisition_jobs set status='needs_review',last_error='An interrupted delivery needs provider review.',lease_token=null,locked_at=null where status='sending' and locked_at<now()-interval '5 minutes';
 update public.crm_acquisition_jobs j set status='cancelled',last_error='Outreach is stopped.' where j.status in ('queued','needs_approval') and ((j.sequence_id is not null and exists(select 1 from public.crm_outreach_controls c where c.project_id=j.project_id)) or exists(select 1 from public.crm_opportunities o join public.crm_stages s on s.id=o.stage_id where o.project_id=j.project_id and s.outcome<>'open') or exists(select 1 from public.clients c where c.id=j.client_id and coalesce(c.is_archived,false)) or (j.sequence_id is not null and not exists(select 1 from public.crm_sequences s where s.id=j.sequence_id and s.enabled)));
 return query with candidates as(select id from public.crm_acquisition_jobs where status='queued' and due_at<=now() order by due_at,id limit greatest(1,least(p_limit,10)) for update skip locked)
 update public.crm_acquisition_jobs j set status='leased',lease_token=gen_random_uuid(),locked_at=now() from candidates c where j.id=c.id returning j.*;
end $$;
revoke all on function public.crm_claim_acquisition(integer) from public,anon,authenticated;
grant execute on function public.crm_claim_acquisition(integer) to service_role;

create function public.crm_prepare_acquisition(p_id uuid,p_lease uuid,p_configured boolean) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare j public.crm_acquisition_jobs%rowtype;f public.crm_issued_files%rowtype;outcome text;pid uuid;
begin
 -- Match the project-before-job lock order used by archival and office actions.
 select project_id into pid from public.crm_acquisition_jobs where id=p_id and lease_token=p_lease and status='leased';
 if not found then return jsonb_build_object('skip',true);end if;
 perform 1 from public.crm_opportunities where project_id=pid for share;
 select * into j from public.crm_acquisition_jobs where id=p_id and lease_token=p_lease and status='leased' for update;
 if not found then return jsonb_build_object('skip',true);end if;
 select s.outcome into outcome from public.crm_opportunities o join public.crm_stages s on s.id=o.stage_id where o.project_id=j.project_id for share of o;
 if outcome is distinct from 'open' or (j.sequence_id is not null and exists(select 1 from public.crm_outreach_controls where project_id=j.project_id)) or exists(select 1 from public.clients where id=j.client_id and coalesce(is_archived,false)) or (j.sequence_id is not null and not exists(select 1 from public.crm_sequences where id=j.sequence_id and enabled)) then
  update public.crm_acquisition_jobs set status='cancelled',last_error='Outreach is stopped.' where id=j.id;return jsonb_build_object('skip',true);
 end if;
 if not p_configured then update public.crm_acquisition_jobs set status='blocked',last_error='Email provider is not configured.' where id=j.id;return jsonb_build_object('skip',true);end if;
 if j.file_id is not null then
  select * into f from public.crm_issued_files where id=j.file_id and revoked_at is null and expires_at>now();
  if not found then update public.crm_acquisition_jobs set status='blocked',last_error='The attached file is expired or revoked.' where id=j.id;return jsonb_build_object('skip',true);end if;
 end if;
 update public.crm_acquisition_jobs set status='sending',first_attempt_at=now(),attempts=attempts+1 where id=j.id;
 return jsonb_build_object('job',to_jsonb(j),'file_token',f.access_token);
end $$;
revoke all on function public.crm_prepare_acquisition(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.crm_prepare_acquisition(uuid,uuid,boolean) to service_role;
create function public.crm_finish_acquisition(p_id uuid,p_lease uuid,p_status text,p_provider text) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare j public.crm_acquisition_jobs%rowtype;
begin
 if p_status not in ('accepted','needs_review','blocked') then raise exception 'Invalid delivery outcome';end if;
 update public.crm_acquisition_jobs set status=p_status,provider_id=p_provider,accepted_at=case when p_status='accepted' then now() else null end,last_error=case when p_status='needs_review' then 'Provider acceptance is unconfirmed. Check the provider before sending another email.' when p_status='blocked' then 'Email provider is not configured.' else null end,locked_at=null where id=p_id and lease_token=p_lease and status='sending' returning * into j;
 if not found then return false;end if;
 insert into public.crm_events(client_id,project_id,kind,body,details) values(j.client_id,j.project_id,'email_'||p_status,'Email '||p_status||': '||j.subject,jsonb_build_object('job_id',j.id,'provider_id',p_provider));
 return true;
end $$;
revoke all on function public.crm_finish_acquisition(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.crm_finish_acquisition(uuid,uuid,text,text) to service_role;

create function public.crm_file_event(p_token text,p_action text,p_id uuid,p_hash text,p_answers jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare f public.crm_issued_files%rowtype;r public.crm_file_responses%rowtype;
begin
 select * into f from public.crm_issued_files where access_token=p_token and revoked_at is null and expires_at>now() for update;
 if not found then return jsonb_build_object('error','File unavailable.');end if;
 if p_action='view' then
  if f.viewed_at is null then
   update public.crm_issued_files set viewed_at=now() where id=f.id;
   insert into public.crm_events(client_id,project_id,kind,body,details) values(f.client_id,f.project_id,'file_viewed','Client file page viewed: '||f.title,jsonb_build_object('file_id',f.id));
  end if;
 elsif p_action='respond' then
  select * into r from public.crm_file_responses where file_id=f.id;
  if found then if r.payload_hash=p_hash then return jsonb_build_object('ok',true);end if;return jsonb_build_object('error','A response has already been received. Contact the office to make a change.');end if;
  insert into public.crm_file_responses(id,file_id,payload_hash,answers) values(p_id,f.id,p_hash,p_answers);
  update public.crm_issued_files set responded_at=now() where id=f.id;
  insert into public.crm_outreach_controls(project_id,reason) values(f.project_id,'Client submitted a smart-file response.') on conflict(project_id) do nothing;
  update public.crm_acquisition_jobs set status='cancelled',last_error='Client submitted a smart-file response.' where project_id=f.project_id and status in ('queued','needs_approval','leased');
  insert into public.crm_events(client_id,project_id,kind,body,details) values(f.client_id,f.project_id,'file_responded','Client submitted a response: '||f.title,jsonb_build_object('file_id',f.id));
 else return jsonb_build_object('error','Unknown action.');end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.crm_file_event(text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_file_event(text,text,uuid,text,jsonb) to service_role;

-- Reviewable starters only. These do not publish a form or contact anyone.
do $$ declare mid uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();formid uuid;begin
 insert into public.crm_message_templates(id,name,subject,body) values(mid,'Inquiry acknowledgment','We received your inquiry · Oceano Blue',E'Hi {{first_name}},\n\nThank you for reaching out to Oceano Blue Media. We received your inquiry about {{project_name}} and our team will review the details.\n\nIf you have anything else to share, reply to this email.\n\nThe Oceano Blue team');
 insert into public.crm_file_templates(id,name,title,description,blocks) values(fid,'Project brief questionnaire','Let’s shape your project','Share a few details so we can prepare the next steps.',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','text','title','Your project','body','Hi {{first_name}}, tell us what success looks like for {{project_name}}.'),jsonb_build_object('id',gen_random_uuid(),'kind','question','field',jsonb_build_object('key','goals','label','What would you like this project to achieve?','type','textarea','required',true))));
 select id into formid from public.crm_forms where slug='contact';
 if formid is not null then insert into public.crm_sequences(id,name,form_id,steps) values(gen_random_uuid(),'Website inquiry → acknowledgment → follow-up',formid,jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','email','delay',0,'unit','hours','message_template_id',mid,'file_template_id',null,'task_title','','requires_approval',true),jsonb_build_object('id',gen_random_uuid(),'kind','task','delay',2,'unit','business_days','message_template_id',null,'file_template_id',null,'task_title','Review inquiry and follow up','requires_approval',true)));end if;
end $$;
