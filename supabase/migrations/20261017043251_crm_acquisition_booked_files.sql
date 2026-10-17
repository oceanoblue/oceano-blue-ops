-- Explicit office file sends are allowed for open and booked projects.
-- Reply holds stop automated sequences; archive/loss stops every queued send.

create or replace function public.crm_acquisition_action(p_actor uuid,p_action text,p_id uuid,p_version integer,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
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
  select o.client_id,jsonb_build_object('client_name',c.full_name,'first_name',split_part(c.full_name,' ',1),'project_name',o.title,'project_type',o.project_type),c.email into cid,ctx,st from public.crm_opportunities o join public.clients c on c.id=o.client_id join public.crm_stages s on s.id=o.stage_id where o.project_id=pid and s.outcome in ('open','won') and not coalesce(c.is_archived,false) for update of o;
  if cid is null then return jsonb_build_object('error','Choose an active project for an active contact.');end if;
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
  if new.stage_id is distinct from old.stage_id and exists(select 1 from public.crm_stages where id=new.stage_id and outcome<>'open') then
   insert into public.crm_outreach_controls(project_id,reason) values(new.project_id,'Project left the open pipeline.') on conflict(project_id) do nothing;
   update public.crm_acquisition_jobs set status='cancelled',last_error='Project left the open pipeline.' where project_id=new.project_id and status in ('queued','needs_approval','leased') and (sequence_id is not null or exists(select 1 from public.crm_stages where id=new.stage_id and outcome in ('archived','lost')));
  end if;
 else
  if coalesce(new.is_archived,false) and not coalesce(old.is_archived,false) then update public.crm_acquisition_jobs set status='cancelled',last_error='Contact archived.' where client_id=new.id and status in ('queued','needs_approval','leased');end if;
 end if;return new;
end $$;

create or replace function public.crm_claim_acquisition(p_limit integer default 5) returns setof public.crm_acquisition_jobs language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.crm_acquisition_jobs set status='queued',lease_token=null,locked_at=null where status='leased' and locked_at<now()-interval '5 minutes';
 update public.crm_acquisition_jobs set status='needs_review',last_error='An interrupted delivery needs provider review.',lease_token=null,locked_at=null where status='sending' and locked_at<now()-interval '5 minutes';
 update public.crm_acquisition_jobs j set status='cancelled',last_error='Outreach is stopped.' where j.status in ('queued','needs_approval') and ((j.sequence_id is not null and exists(select 1 from public.crm_outreach_controls c where c.project_id=j.project_id)) or exists(select 1 from public.crm_opportunities o join public.crm_stages s on s.id=o.stage_id where o.project_id=j.project_id and (s.outcome in ('archived','lost') or (j.sequence_id is not null and s.outcome<>'open'))) or exists(select 1 from public.clients c where c.id=j.client_id and coalesce(c.is_archived,false)) or (j.sequence_id is not null and not exists(select 1 from public.crm_sequences s where s.id=j.sequence_id and s.enabled)));
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
 if outcome is null or outcome in ('archived','lost') or (j.sequence_id is not null and outcome<>'open') or (j.sequence_id is not null and exists(select 1 from public.crm_outreach_controls where project_id=j.project_id)) or exists(select 1 from public.clients where id=j.client_id and coalesce(is_archived,false)) or (j.sequence_id is not null and not exists(select 1 from public.crm_sequences where id=j.sequence_id and enabled)) then
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

create or replace function public.crm_file_event(p_token text,p_action text,p_id uuid,p_hash text,p_answers jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
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
  update public.crm_acquisition_jobs set status='cancelled',last_error='Client submitted a smart-file response.' where project_id=f.project_id and sequence_id is not null and status in ('queued','needs_approval','leased');
  insert into public.crm_events(client_id,project_id,kind,body,details) values(f.client_id,f.project_id,'file_responded','Client submitted a response: '||f.title,jsonb_build_object('file_id',f.id));
 else return jsonb_build_object('error','Unknown action.');end if;
 return jsonb_build_object('ok',true);
end $$;
