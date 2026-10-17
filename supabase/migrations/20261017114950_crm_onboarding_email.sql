-- Explicit booked-client onboarding and standalone template emails.
-- Historical imports never start a workflow. All new starter content is draft.
alter table public.crm_message_templates add column cta_label text not null default '',add column cta_url text not null default '';
alter table public.crm_sequences alter column form_id drop not null;
alter table public.crm_sequences add column enrollment_kind text not null default 'inquiry' check(enrollment_kind in ('inquiry','onboarding'));
alter table public.crm_sequences add constraint crm_sequence_source_check check((enrollment_kind='inquiry' and form_id is not null) or (enrollment_kind='onboarding' and form_id is null));
create table public.crm_sequence_enrollments (
 id uuid primary key,sequence_id uuid not null references public.crm_sequences(id),project_id uuid not null references public.projects(id),client_id uuid not null references public.clients(id),
 started_by uuid not null references public.team_members(id),started_at timestamptz not null default now(),request_payload jsonb not null,
 unique(project_id,sequence_id)
);
create index crm_sequence_enrollments_sequence_idx on public.crm_sequence_enrollments(sequence_id);
create index crm_sequence_enrollments_client_idx on public.crm_sequence_enrollments(client_id,started_at desc);
alter table public.crm_sequence_enrollments enable row level security;
revoke all on public.crm_sequence_enrollments from public,anon,authenticated;
grant select on public.crm_sequence_enrollments to authenticated;
grant select,insert on public.crm_sequence_enrollments to service_role;
grant delete on public.crm_outreach_controls to service_role;
create policy office_read on public.crm_sequence_enrollments for select to authenticated using(exists(select 1 from public.team_members t where t.id=(select auth.uid()) and t.is_active and t.role::text in ('admin','coordinator')));
create trigger crm_sequence_enrollment_immutable before update or delete on public.crm_sequence_enrollments for each row execute function public.crm_history_guard();
alter table public.crm_acquisition_jobs add column enrollment_id uuid references public.crm_sequence_enrollments(id),add column cta_label text not null default '',add column cta_url text not null default '';
create unique index crm_acquisition_enrollment_step_idx on public.crm_acquisition_jobs(enrollment_id,step_id) where enrollment_id is not null;
create function public.crm_secure_email_link(p_url text) returns boolean language sql immutable security invoker set search_path=pg_catalog,public as $$
 select length(p_url)<=2000 and p_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$' and p_url !~ '[[:cntrl:]]'
$$;
revoke all on function public.crm_secure_email_link(text) from public,anon,authenticated;
grant execute on function public.crm_secure_email_link(text) to service_role;
alter table public.crm_message_templates add constraint crm_message_cta_check check((cta_label='' and cta_url='') or (length(cta_label) between 1 and 80 and public.crm_secure_email_link(cta_url)));
alter table public.crm_acquisition_jobs add constraint crm_job_cta_check check((cta_label='' and cta_url='') or (length(cta_label) between 1 and 80 and public.crm_secure_email_link(cta_url)));

-- A single predicate is rechecked at claim, preparation and pipeline transitions.
create function public.crm_acquisition_eligible(p_project uuid,p_client uuid,p_sequence uuid) returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
 select exists(select 1 from public.crm_opportunities o join public.crm_stages s on s.id=o.stage_id join public.clients c on c.id=o.client_id where o.project_id=p_project and o.client_id=p_client and s.outcome in ('open','won') and not coalesce(c.is_archived,false)
 and (p_sequence is null or (not exists(select 1 from public.crm_outreach_controls h where h.project_id=p_project) and exists(select 1 from public.crm_sequences w where w.id=p_sequence and w.enabled and ((w.enrollment_kind='inquiry' and s.outcome='open') or (w.enrollment_kind='onboarding' and s.outcome='won'))))))
$$;
revoke all on function public.crm_acquisition_eligible(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_acquisition_eligible(uuid,uuid,uuid) to service_role;
create or replace function public.crm_mail_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if old.id<>new.id or old.project_id<>new.project_id or old.client_id<>new.client_id or old.recipient<>new.recipient or old.subject<>new.subject or old.body<>new.body or old.cta_label<>new.cta_label or old.cta_url<>new.cta_url or old.enrollment_id is distinct from new.enrollment_id or old.context<>new.context or old.file_id is distinct from new.file_id or old.sequence_id is distinct from new.sequence_id or old.submission_id is distinct from new.submission_id or old.step_id is distinct from new.step_id or old.request_payload is distinct from new.request_payload or old.created_at<>new.created_at then raise exception 'Queued email content is immutable';end if;
 if old.first_attempt_at is not null and old.first_attempt_at is distinct from new.first_attempt_at then raise exception 'The first send attempt is immutable';end if;
 if old.status='accepted' and (new.status<>'accepted' or old.provider_id is distinct from new.provider_id or old.accepted_at is distinct from new.accepted_at) then raise exception 'Accepted email history is immutable';end if;
 return new;
end $$;
create or replace function public.crm_enqueue_acquisition() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare seq public.crm_sequences%rowtype;step jsonb;msg public.crm_message_templates%rowtype;ft public.crm_file_templates%rowtype;ctx jsonb;fid uuid;due timestamptz;owner uuid;
begin
 select jsonb_build_object('client_name',c.full_name,'first_name',split_part(c.full_name,' ',1),'project_name',o.title,'project_type',o.project_type),o.owner_id into ctx,owner from public.crm_opportunities o join public.clients c on c.id=o.client_id join public.crm_stages s on s.id=o.stage_id where o.project_id=new.project_id and s.outcome='open' and not coalesce(c.is_archived,false);
 if ctx is null then return new;end if;
 for seq in select * from public.crm_sequences where enabled and enrollment_kind='inquiry' and form_id=new.form_id loop
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
    insert into public.crm_acquisition_jobs(sequence_id,submission_id,step_id,project_id,client_id,file_id,recipient,subject,body,cta_label,cta_url,context,status,due_at)
    values(seq.id,new.id,(step->>'id')::uuid,new.project_id,new.client_id,fid,new.answers->>'email',msg.subject,msg.body,msg.cta_label,msg.cta_url,ctx,case when coalesce((step->>'requires_approval')::boolean,true) then 'needs_approval' else 'queued' end,due);
   end if;
  end loop;
 end loop;
 return new;
end $$;
create or replace function public.crm_acquisition_action(p_actor uuid,p_action text,p_id uuid,p_version integer,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare ver integer;step jsonb;cid uuid;pid uuid;ft public.crm_file_templates%rowtype;msg public.crm_message_templates%rowtype;ctx jsonb;old_job public.crm_acquisition_jobs%rowtype;fid uuid;st text;seq public.crm_sequences%rowtype;enrollment public.crm_sequence_enrollments%rowtype;eid uuid;due timestamptz;owner uuid;
begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Office access required.');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,11));
 case p_action
 when 'message_template_save' then
  if (coalesce(p_data->>'cta_url','')='')<>(coalesce(p_data->>'cta_label','')='') or (coalesce(p_data->>'cta_url','')<>'' and not public.crm_secure_email_link(p_data->>'cta_url')) then return jsonb_build_object('error','Add a button label and secure HTTPS link without login details.');end if;
  select version into ver from public.crm_message_templates where id=p_id for update;
  if (found and ver<>p_version) or (not found and p_version<>0) then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
  insert into public.crm_message_templates(id,name,subject,body,ready,cta_label,cta_url) values(p_id,p_data->>'name',p_data->>'subject',p_data->>'body',(p_data->>'ready')::boolean,coalesce(p_data->>'cta_label',''),coalesce(p_data->>'cta_url',''))
  on conflict(id) do update set name=excluded.name,subject=excluded.subject,body=excluded.body,cta_label=excluded.cta_label,cta_url=excluded.cta_url,ready=excluded.ready,version=crm_message_templates.version+1,updated_at=now() returning version into ver;
 when 'file_template_save' then
  select version into ver from public.crm_file_templates where id=p_id for update;
  if (found and ver<>p_version) or (not found and p_version<>0) then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
  insert into public.crm_file_templates(id,name,title,description,blocks,ready) values(p_id,p_data->>'name',p_data->>'title',p_data->>'description',p_data->'blocks',(p_data->>'ready')::boolean)
  on conflict(id) do update set name=excluded.name,title=excluded.title,description=excluded.description,blocks=excluded.blocks,ready=excluded.ready,version=crm_file_templates.version+1,updated_at=now() returning version into ver;
 when 'sequence_save' then
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_data->>'timezone') then return jsonb_build_object('error','Choose a valid business timezone.');end if;
  if coalesce(p_data->>'enrollment_kind','inquiry') not in ('inquiry','onboarding') then return jsonb_build_object('error','Choose a workflow type.');end if;
  if coalesce(p_data->>'enrollment_kind','inquiry')='inquiry' and not exists(select 1 from public.crm_forms where id=(p_data->>'form_id')::uuid) then return jsonb_build_object('error','Contact form not found.');end if;
  if p_data->>'enrollment_kind'='onboarding' and nullif(p_data->>'form_id','') is not null then return jsonb_build_object('error','Onboarding starts from a booked project, not a contact form.');end if;
  if exists(select 1 from public.crm_sequences s where s.id=p_id and s.enrollment_kind<>coalesce(p_data->>'enrollment_kind','inquiry')) and (exists(select 1 from public.crm_acquisition_jobs where sequence_id=p_id) or exists(select 1 from public.crm_sequence_enrollments where sequence_id=p_id)) then return jsonb_build_object('error','Create a new workflow to change its enrollment type after use.');end if;
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
  insert into public.crm_sequences(id,name,form_id,enabled,timezone,steps,enrollment_kind) values(p_id,p_data->>'name',(nullif(p_data->>'form_id',''))::uuid,(p_data->>'enabled')::boolean,p_data->>'timezone',p_data->'steps',coalesce(p_data->>'enrollment_kind','inquiry'))
  on conflict(id) do update set name=excluded.name,form_id=excluded.form_id,enrollment_kind=excluded.enrollment_kind,enabled=excluded.enabled,timezone=excluded.timezone,steps=excluded.steps,version=crm_sequences.version+1,updated_at=now() returning version into ver;
  if not (p_data->>'enabled')::boolean then update public.crm_acquisition_jobs set status='cancelled',last_error='Workflow paused.' where sequence_id=p_id and status in ('queued','needs_approval','leased');end if;
 when 'issue_file','send_message' then
  select * into old_job from public.crm_acquisition_jobs where id=p_id;
  if found then
   if old_job.approved_by is distinct from p_actor or old_job.request_payload is distinct from p_data then return jsonb_build_object('error','Request ID already used.');end if;
   return jsonb_build_object('id',p_id,'file_id',old_job.file_id);
  end if;
  pid:=(p_data->>'project_id')::uuid;
  select o.client_id,jsonb_build_object('client_name',c.full_name,'first_name',split_part(c.full_name,' ',1),'project_name',o.title,'project_type',o.project_type),c.email into cid,ctx,st from public.crm_opportunities o join public.clients c on c.id=o.client_id join public.crm_stages s on s.id=o.stage_id where o.project_id=pid and s.outcome in ('open','won') and not coalesce(c.is_archived,false) for update of o;
  if cid is null then return jsonb_build_object('error','Choose an active project for an active contact.');end if;
  select * into msg from public.crm_message_templates where id=(p_data->>'message_template_id')::uuid and ready;
  if not found then return jsonb_build_object('error','Choose a ready email template.');end if;
  due:=coalesce((p_data->>'due_at')::timestamptz,now());
  if due<now()-interval '5 minutes' or due>now()+interval '366 days' then return jsonb_build_object('error','Choose a send time within the next year.');end if;
  fid:=null;
  if p_action='issue_file' or nullif(p_data->>'file_template_id','') is not null then
   select * into ft from public.crm_file_templates where id=(p_data->>'file_template_id')::uuid and ready;
   if not found then return jsonb_build_object('error','Choose a ready smart-file template.');end if;
   insert into public.crm_issued_files(template_id,project_id,client_id,title,snapshot,context,created_by,expires_at) values(ft.id,pid,cid,ft.title,to_jsonb(ft),ctx,p_actor,due+interval '30 days') returning id into fid;
  end if;
  insert into public.crm_acquisition_jobs(id,project_id,client_id,file_id,recipient,subject,body,cta_label,cta_url,context,status,due_at,approved_by,request_payload) values(p_id,pid,cid,fid,st,msg.subject,msg.body,msg.cta_label,msg.cta_url,ctx,'queued',due,p_actor,p_data);
 when 'sequence_start' then
  pid:=(p_data->>'project_id')::uuid;
  -- Serialize all starts for a project before inspecting its enrollment ledger.
  perform pg_advisory_xact_lock(hashtextextended(pid::text,12));
  select * into enrollment from public.crm_sequence_enrollments where project_id=pid and sequence_id=(p_data->>'sequence_id')::uuid;
  if found then return jsonb_build_object('id',enrollment.id,'already_started',true);end if;
  if exists(select 1 from public.crm_sequence_enrollments where id=p_id) then return jsonb_build_object('error','Request ID already used.');end if;
  select * into seq from public.crm_sequences where id=(p_data->>'sequence_id')::uuid and enrollment_kind='onboarding' and enabled for share;
  if not found then return jsonb_build_object('error','Choose an enabled onboarding workflow.');end if;
  select o.client_id,o.owner_id,jsonb_build_object('client_name',c.full_name,'first_name',split_part(c.full_name,' ',1),'project_name',o.title,'project_type',o.project_type),c.email into cid,owner,ctx,st from public.crm_opportunities o join public.clients c on c.id=o.client_id join public.crm_stages s on s.id=o.stage_id where o.project_id=pid and s.outcome='won' and not coalesce(c.is_archived,false) for update of o;
  if cid is null then return jsonb_build_object('error','Onboarding requires a booked project and an active contact.');end if;
  if exists(select 1 from public.crm_outreach_controls where project_id=pid) and not coalesce((p_data->>'resume_followups')::boolean,false) then return jsonb_build_object('error','Confirm resuming follow-ups for this project before starting onboarding.');end if;
  -- Validate all steps before creating any file, task, or enrollment.
  for step in select * from jsonb_array_elements(seq.steps) loop
   if step->>'kind'='email' then
    if not exists(select 1 from public.crm_message_templates where id=(step->>'message_template_id')::uuid and ready) then return jsonb_build_object('error','Review and mark each email template ready.');end if;
    if nullif(step->>'file_template_id','') is not null and not exists(select 1 from public.crm_file_templates where id=(step->>'file_template_id')::uuid and ready) then return jsonb_build_object('error','Review and mark each smart-file template ready.');end if;
   end if;
  end loop;
  if coalesce((p_data->>'resume_followups')::boolean,false) then delete from public.crm_outreach_controls where project_id=pid;end if;
  insert into public.crm_sequence_enrollments(id,project_id,client_id,sequence_id,started_by,request_payload) values(p_id,pid,cid,seq.id,p_actor,p_data) returning id into eid;
  for step in select * from jsonb_array_elements(seq.steps) loop
   due:=public.crm_due_at(now(),(step->>'delay')::integer,step->>'unit',seq.timezone);
   if step->>'kind'='task' then
    insert into public.crm_tasks(client_id,project_id,title,owner_id,due_at) values(cid,pid,step->>'task_title',coalesce(owner,p_actor),due);
   else
    select * into msg from public.crm_message_templates where id=(step->>'message_template_id')::uuid and ready;
    fid:=null;
    if nullif(step->>'file_template_id','') is not null then
     select * into ft from public.crm_file_templates where id=(step->>'file_template_id')::uuid and ready;
     insert into public.crm_issued_files(template_id,project_id,client_id,title,snapshot,context,created_by,expires_at) values(ft.id,pid,cid,ft.title,to_jsonb(ft),ctx,p_actor,due+interval '30 days') returning id into fid;
    end if;
    insert into public.crm_acquisition_jobs(sequence_id,enrollment_id,step_id,project_id,client_id,file_id,recipient,subject,body,cta_label,cta_url,context,status,due_at)
    values(seq.id,eid,(step->>'id')::uuid,pid,cid,fid,st,msg.subject,msg.body,msg.cta_label,msg.cta_url,ctx,case when coalesce((step->>'requires_approval')::boolean,true) then 'needs_approval' else 'queued' end,due);
   end if;
  end loop;
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
  update public.crm_acquisition_jobs set status='cancelled',last_error='Follow-ups stopped by the office.' where project_id=pid and sequence_id is not null and status in ('needs_approval','queued','leased','blocked','needs_review');
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

create or replace function public.crm_stop_outreach() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if tg_table_name='crm_opportunities' then
  if new.stage_id is distinct from old.stage_id then
   if exists(select 1 from public.crm_stages where id=new.stage_id and outcome in ('archived','lost')) then
    insert into public.crm_outreach_controls(project_id,reason) values(new.project_id,'Project archived or lost.') on conflict(project_id) do nothing;
   end if;
   update public.crm_acquisition_jobs j set status='cancelled',last_error='Project stage no longer matches the workflow.' where j.project_id=new.project_id and j.status in ('queued','needs_approval','leased') and not public.crm_acquisition_eligible(j.project_id,j.client_id,j.sequence_id);
  end if;
 else
  if coalesce(new.is_archived,false) and not coalesce(old.is_archived,false) then update public.crm_acquisition_jobs set status='cancelled',last_error='Contact archived.' where client_id=new.id and status in ('queued','needs_approval','leased');end if;
 end if;return new;
end $$;
create or replace function public.crm_claim_acquisition(p_limit integer default 5) returns setof public.crm_acquisition_jobs language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.crm_acquisition_jobs set status='queued',lease_token=null,locked_at=null where status='leased' and locked_at<now()-interval '5 minutes';
 update public.crm_acquisition_jobs set status='needs_review',last_error='An interrupted delivery needs provider review.',lease_token=null,locked_at=null where status='sending' and locked_at<now()-interval '5 minutes';
 update public.crm_acquisition_jobs j set status='cancelled',last_error='Outreach is stopped.' where j.status in ('queued','needs_approval') and not public.crm_acquisition_eligible(j.project_id,j.client_id,j.sequence_id);
 return query with candidates as(select id from public.crm_acquisition_jobs where status='queued' and due_at<=now() order by due_at,id limit greatest(1,least(p_limit,10)) for update skip locked)
 update public.crm_acquisition_jobs j set status='leased',lease_token=gen_random_uuid(),locked_at=now() from candidates c where j.id=c.id returning j.*;
end $$;

create or replace function public.crm_prepare_acquisition(p_id uuid,p_lease uuid,p_configured boolean) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare j public.crm_acquisition_jobs%rowtype;f public.crm_issued_files%rowtype;outcome text;pid uuid;
begin
 -- Match the project-before-job lock order used by archival and office actions.
 select project_id into pid from public.crm_acquisition_jobs where id=p_id and lease_token=p_lease and status='leased';
 if not found then return jsonb_build_object('skip',true);end if;
 perform 1 from public.crm_opportunities where project_id=pid for share;
 select * into j from public.crm_acquisition_jobs where id=p_id and lease_token=p_lease and status='leased' for update;
 if not found then return jsonb_build_object('skip',true);end if;
 select s.outcome into outcome from public.crm_opportunities o join public.crm_stages s on s.id=o.stage_id where o.project_id=j.project_id for share of o;
 if not public.crm_acquisition_eligible(j.project_id,j.client_id,j.sequence_id) then
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


-- Practical starter copy is editable and intentionally unapproved.
do $$ declare welcome uuid:=gen_random_uuid();consult uuid:=gen_random_uuid();brief uuid:=gen_random_uuid(); begin
 insert into public.crm_message_templates(id,name,subject,body) values(welcome,'Wedding · welcome and next steps','Your wedding plans · Oceano Blue',E'Hi {{first_name}},\n\nWe are looking forward to creating with you for {{project_name}}. Please share your current timeline, venues, key contacts, and the moments that matter most to you. It is completely fine if some details are still taking shape.\n\nOur team will review everything together and help you plan the next steps. You can reply here whenever something changes.\n\nThe Oceano Blue team');
 insert into public.crm_message_templates(id,name,subject,body,cta_label,cta_url) values(consult,'Consultation · plan our conversation','Let’s talk about {{project_name}}',E'Hi {{first_name}},\n\nWe would love to hear more about your plans for {{project_name}} and what you want to create. Choose a time using the scheduling link below, or reply with any questions before we meet.\n\nThe Oceano Blue team','Choose a consultation time','https://app.oceanoblue.net/meet/consultation');
 insert into public.crm_file_templates(id,name,title,description,blocks) values(brief,'Wedding · planning questionnaire','Your wedding plans','Share what you know so far. Our team will help with the next steps.',jsonb_build_array(
 jsonb_build_object('id',gen_random_uuid(),'kind','text','title','A little about your day','body','Hi {{first_name}}, this is a place to keep the details for {{project_name}} together. You can reply to our office if plans change after submitting.'),
 jsonb_build_object('id',gen_random_uuid(),'kind','question','field',jsonb_build_object('key','wedding_date','label','Wedding date','type','date','required',false)),
 jsonb_build_object('id',gen_random_uuid(),'kind','question','field',jsonb_build_object('key','venues','label','Ceremony and reception locations','type','textarea','required',false)),
 jsonb_build_object('id',gen_random_uuid(),'kind','question','field',jsonb_build_object('key','timeline','label','Timeline, key contacts, and moments you want us to know about','type','textarea','required',false))));
 insert into public.crm_sequences(id,name,form_id,enrollment_kind,steps) values(gen_random_uuid(),'Wedding · welcome and planning follow-through',null,'onboarding',jsonb_build_array(
 jsonb_build_object('id',gen_random_uuid(),'kind','email','delay',0,'unit','hours','message_template_id',welcome,'file_template_id',brief,'task_title','','requires_approval',true),
 jsonb_build_object('id',gen_random_uuid(),'kind','task','delay',2,'unit','business_days','message_template_id',null,'file_template_id',null,'task_title','Review wedding onboarding, confirm the date and planning call','requires_approval',true)));
end $$;
