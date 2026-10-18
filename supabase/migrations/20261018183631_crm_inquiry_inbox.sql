-- Actual future Ops form inquiries only. Historical imports never enroll.
create table public.crm_inquiry_followups (
 id uuid primary key default gen_random_uuid(),project_id uuid not null unique references public.projects(id),client_id uuid not null references public.clients(id),
 submission_id uuid unique references public.crm_submissions(id),source text not null,message text not null,
 received_at timestamptz not null,due_at timestamptz not null,state text not null default 'open' check(state in ('open','snoozed','answered','dismissed')),
 snoozed_until timestamptz,answered_at timestamptz,response_channel text,response_note text not null default '',
 queued_reply_job_id uuid references public.crm_acquisition_jobs(id),reminder_cycle integer not null default 0,cycle integer not null default 0,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index crm_inquiry_due_idx on public.crm_inquiry_followups(due_at) where state in ('open','snoozed');
create index crm_inquiry_client_idx on public.crm_inquiry_followups(client_id);
create table public.crm_inquiry_actions (
 id uuid primary key default gen_random_uuid(),inquiry_id uuid not null references public.crm_inquiry_followups(id),actor_id uuid references public.team_members(id),
 action text not null,note text not null,created_at timestamptz not null default now()
);
create index crm_inquiry_actions_inquiry_idx on public.crm_inquiry_actions(inquiry_id,created_at desc);
create table public.crm_inquiry_replies (
 job_id uuid primary key references public.crm_acquisition_jobs(id),inquiry_id uuid not null references public.crm_inquiry_followups(id),
 cycle integer not null,actor_id uuid not null references public.team_members(id),request_payload jsonb not null,created_at timestamptz not null default now()
);
create index crm_inquiry_reply_inquiry_idx on public.crm_inquiry_replies(inquiry_id,created_at desc);
create table public.crm_inquiry_notifications (
 id uuid primary key default gen_random_uuid(),inquiry_id uuid not null references public.crm_inquiry_followups(id),cycle integer not null,milestone integer not null check(milestone in (1,2)),
 recipient text not null,subject text not null,body text not null,status text not null default 'queued' check(status in ('queued','leased','sending','accepted','blocked','needs_review','cancelled')),
 lease_token uuid,locked_at timestamptz,first_attempt_at timestamptz,provider_id text,accepted_at timestamptz,created_at timestamptz not null default now(),
 unique(inquiry_id,cycle,milestone)
);
create index crm_inquiry_notification_due_idx on public.crm_inquiry_notifications(created_at) where status in ('queued','leased','sending');
do $$ declare tbl text;begin
 foreach tbl in array array['crm_inquiry_followups','crm_inquiry_actions','crm_inquiry_replies','crm_inquiry_notifications'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from public,anon,authenticated',tbl);
  execute format('grant select on public.%I to authenticated',tbl);
  execute format('grant select,insert,update on public.%I to service_role',tbl);
  execute format('create policy office_read on public.%I for select to authenticated using(exists(select 1 from public.team_members t where t.id=(select auth.uid()) and t.is_active and t.role::text in (''admin'',''coordinator'')))',tbl);
 end loop;
end $$;
create trigger crm_inquiry_actions_immutable before update or delete on public.crm_inquiry_actions for each row execute function public.crm_history_guard();
create trigger crm_inquiry_replies_immutable before update or delete on public.crm_inquiry_replies for each row execute function public.crm_history_guard();
create function public.crm_inquiry_eligible(p_project uuid,p_client uuid) returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
 select exists(select 1 from public.crm_opportunities o join public.crm_stages s on s.id=o.stage_id join public.clients c on c.id=o.client_id where o.project_id=p_project and o.client_id=p_client and s.outcome='open' and not coalesce(c.is_archived,false))
$$;
create function public.crm_capture_inquiry() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if public.crm_inquiry_eligible(new.project_id,new.client_id) then
 insert into public.crm_inquiry_followups(project_id,client_id,submission_id,source,message,received_at,due_at)
 values(new.project_id,new.client_id,new.id,'Ops contact form',coalesce(new.answers->>'message',''),new.created_at,new.created_at+interval '24 hours') on conflict(project_id) do nothing;
 end if;return new;
end $$;
create trigger crm_capture_inquiry after insert on public.crm_submissions for each row execute function public.crm_capture_inquiry();

create function public.crm_inquiry_action(p_actor uuid,p_action text,p_id uuid,p_version integer,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.crm_inquiry_followups%rowtype;reply public.crm_inquiry_replies%rowtype;cid uuid;recipient text;ctx jsonb;jid uuid;vuntil timestamptz;received timestamptz;
begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Office access required.');end if;
 if p_action='enroll_project' then
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,31));
  select * into r from public.crm_inquiry_followups where project_id=p_id;
  if found then return jsonb_build_object('id',r.id,'version',r.version,'already_enrolled',true);end if;
  select client_id into cid from public.crm_opportunities where project_id=p_id for update;
  if cid is null or not public.crm_inquiry_eligible(p_id,cid) then return jsonb_build_object('error','Choose an open inquiry project with an active contact.');end if;
  if length(trim(coalesce(p_data->>'message',''))) not between 1 and 10000 or length(trim(coalesce(p_data->>'source',''))) not between 1 and 200 or length(trim(coalesce(p_data->>'note',''))) not between 1 and 2000 then return jsonb_build_object('error','Record the source message and enrollment reason.');end if;
  received:=(p_data->>'received_at')::timestamptz;
  if received is null or received>now()+interval '5 minutes' or received<now()-interval '10 years' then return jsonb_build_object('error','Choose a valid inquiry received time.');end if;
  insert into public.crm_inquiry_followups(project_id,client_id,source,message,received_at,due_at) values(p_id,cid,p_data->>'source',p_data->>'message',received,received+interval '24 hours') returning * into r;
  insert into public.crm_inquiry_actions(inquiry_id,actor_id,action,note) values(r.id,p_actor,'enrolled',p_data->>'note');
  return jsonb_build_object('id',r.id,'version',r.version);
 end if;
 -- Project -> inquiry -> jobs, consistent with archival and acquisition preparation.
 select project_id into jid from public.crm_inquiry_followups where id=p_id;
 if jid is null then return jsonb_build_object('error','Inquiry not found.');end if;
 perform 1 from public.crm_opportunities where project_id=jid for update;
 perform 1 from public.crm_acquisition_jobs j join public.crm_inquiry_replies x on x.job_id=j.id where x.inquiry_id=p_id order by j.id for update of j;
 select * into r from public.crm_inquiry_followups where id=p_id for update;
 if p_action='send_reply' then
  jid:=(p_data->>'request_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(jid::text,11));
  select * into reply from public.crm_inquiry_replies where job_id=jid;
  if found then
   if reply.inquiry_id<>p_id or reply.actor_id<>p_actor or reply.request_payload<>p_data then return jsonb_build_object('error','Request ID already used.');end if;
   return jsonb_build_object('id',r.id,'version',r.version,'job_id',jid,'already_queued',true);
  end if;
 end if;
 if r.version<>p_version then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
 if not public.crm_inquiry_eligible(r.project_id,r.client_id) then return jsonb_build_object('error','This inquiry project is booked, closed or archived.');end if;
 if p_action='send_reply' then
  if r.state not in ('open','snoozed') then return jsonb_build_object('error','Reopen this inquiry before replying.');end if;
  if length(trim(coalesce(p_data->>'subject',''))) not between 1 and 200 or p_data->>'subject' ~ E'[\r\n]' or length(trim(coalesce(p_data->>'body',''))) not between 1 and 10000 then return jsonb_build_object('error','Review the reply subject and message.');end if;
  if exists(select 1 from public.crm_inquiry_replies x join public.crm_acquisition_jobs j on j.id=x.job_id where x.inquiry_id=r.id and x.cycle=r.cycle and j.status in ('queued','leased','sending','needs_review','needs_approval')) then return jsonb_build_object('error','A reply is already queued or needs delivery review.');end if;
  if exists(select 1 from public.crm_acquisition_jobs where id=jid) then return jsonb_build_object('error','Request ID already used.');end if;
  select c.email,jsonb_build_object('client_name',c.full_name,'first_name',split_part(c.full_name,' ',1),'project_name',o.title,'project_type',o.project_type) into recipient,ctx from public.clients c join public.crm_opportunities o on o.client_id=c.id where o.project_id=r.project_id;
  if recipient is null or recipient !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return jsonb_build_object('error','Review the contact email first.');end if;
  update public.crm_acquisition_jobs set status='cancelled',last_error='Superseded by a newly reviewed inquiry reply.' where id in(select job_id from public.crm_inquiry_replies where inquiry_id=r.id) and status='blocked';
  insert into public.crm_acquisition_jobs(id,project_id,client_id,recipient,subject,body,context,status,due_at,approved_by,request_payload) values(jid,r.project_id,r.client_id,recipient,p_data->>'subject',p_data->>'body',ctx,'queued',now(),p_actor,p_data);
  insert into public.crm_inquiry_replies(job_id,inquiry_id,cycle,actor_id,request_payload) values(jid,r.id,r.cycle,p_actor,p_data);
  update public.crm_inquiry_followups set queued_reply_job_id=jid,version=version+1,updated_at=now() where id=r.id returning * into r;
  insert into public.crm_inquiry_actions(inquiry_id,actor_id,action,note) values(r.id,p_actor,'reply_queued','Reviewed reply queued; provider acceptance is still pending.');
  return jsonb_build_object('id',r.id,'version',r.version,'job_id',jid);
 end if;
 if length(trim(coalesce(p_data->>'note',''))) not between 1 and 2000 then return jsonb_build_object('error','Add a response or review note.');end if;
 case p_action
 when 'snooze' then
  if r.state not in ('open','snoozed') then return jsonb_build_object('error','Only unanswered inquiries can be snoozed.');end if;
  vuntil:=(p_data->>'until')::timestamptz;
  if vuntil is null or vuntil<=now() or vuntil>now()+interval '90 days' then return jsonb_build_object('error','Snooze for up to90 days.');end if;
  update public.crm_inquiry_followups set state='snoozed',snoozed_until=vuntil,due_at=vuntil,reminder_cycle=reminder_cycle+1 where id=r.id;
 when 'answered' then
  if p_data->>'channel' not in ('email','phone','meeting','other') then return jsonb_build_object('error','Choose the response channel.');end if;
  update public.crm_inquiry_followups set state='answered',answered_at=now(),response_channel=p_data->>'channel',response_note=p_data->>'note',snoozed_until=null where id=r.id;
 when 'dismiss' then update public.crm_inquiry_followups set state='dismissed',response_note=p_data->>'note',snoozed_until=null where id=r.id;
 when 'reopen' then update public.crm_inquiry_followups set state='open',answered_at=null,response_channel=null,response_note='',snoozed_until=null,due_at=now()+interval '24 hours',cycle=cycle+1,reminder_cycle=reminder_cycle+1 where id=r.id;
 else return jsonb_build_object('error','Unknown inquiry action.');end case;
 if p_action in ('answered','dismiss','reopen','snooze') then
  update public.crm_inquiry_notifications set status='cancelled' where inquiry_id=r.id and status in ('queued','leased');
 end if;
 if p_action in ('answered','dismiss','reopen') then
  update public.crm_acquisition_jobs set status='cancelled',last_error='Inquiry office review changed.' where id in(select job_id from public.crm_inquiry_replies where inquiry_id=r.id) and status in ('queued','needs_approval','leased');
 end if;
 update public.crm_inquiry_followups set version=version+1,updated_at=now() where id=r.id returning * into r;
 insert into public.crm_inquiry_actions(inquiry_id,actor_id,action,note) values(r.id,p_actor,p_action,p_data->>'note');
 return jsonb_build_object('id',r.id,'version',r.version);
end $$;

-- Only replies explicitly composed/queued in this inbox can close an inquiry.
create function public.crm_inquiry_reply_accepted() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare link public.crm_inquiry_replies%rowtype;r public.crm_inquiry_followups%rowtype;
begin
 if new.status<>'accepted' or old.status='accepted' or coalesce(new.provider_id,'')='' or new.accepted_at is null then return new;end if;
 select * into link from public.crm_inquiry_replies where job_id=new.id;
 if not found then return new;end if;
 select * into r from public.crm_inquiry_followups where id=link.inquiry_id for update;
 if r.queued_reply_job_id is distinct from new.id or r.cycle<>link.cycle or r.state not in ('open','snoozed') then return new;end if;
 update public.crm_inquiry_followups set state='answered',answered_at=new.accepted_at,response_channel='email',response_note='Reviewed inbox reply accepted by the email provider; inbox delivery is not confirmed.',snoozed_until=null,version=version+1,updated_at=now() where id=r.id;
 update public.crm_inquiry_notifications set status='cancelled' where inquiry_id=r.id and status in ('queued','leased');
 insert into public.crm_inquiry_actions(inquiry_id,actor_id,action,note) values(r.id,link.actor_id,'reply_accepted','Reviewed inbox reply accepted by the email provider; inbox delivery is not confirmed.');
 return new;
end $$;
create trigger crm_inquiry_reply_accepted after update of status on public.crm_acquisition_jobs for each row execute function public.crm_inquiry_reply_accepted();

create function public.crm_inquiry_page(p_actor uuid,p_query text,p_status text,p_page integer) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb;begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Office access required.');end if;
 if p_status not in ('due','unanswered','snoozed','answered','dismissed','closed','all') or p_page not between 0 and 100000 or length(p_query)>120 then return jsonb_build_object('error','Invalid inbox filters.');end if;
 with base as (
 select f.*,o.title,c.full_name client_name,c.email client_email,o.project_type,o.project_date,o.owner_id,t.full_name owner_name,not public.crm_inquiry_eligible(f.project_id,f.client_id) closed,
 (f.state in ('open','snoozed') and (f.snoozed_until is null or f.snoozed_until<=now())) unanswered,
 (f.state='snoozed' and f.snoozed_until>now()) snoozed
 from public.crm_inquiry_followups f join public.crm_opportunities o on o.project_id=f.project_id join public.clients c on c.id=f.client_id left join public.team_members t on t.id=o.owner_id
 ), filtered as (
 select * from base where (p_query='' or strpos(lower(title||' '||client_name||' '||client_email||' '||message),lower(p_query))>0)
 and (p_status='all' or (p_status='closed' and closed) or (not closed and ((p_status='due' and unanswered and due_at<=now()) or (p_status='unanswered' and unanswered) or (p_status='snoozed' and snoozed) or (p_status in ('answered','dismissed') and state=p_status))))
 ), page as(select * from filtered order by due_at,id limit 50 offset(p_page*50))
 select jsonb_build_object('inquiries',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object(
 'reply_job_id',p.queued_reply_job_id,
 'reply_status',(select j.status from public.crm_acquisition_jobs j where j.id=p.queued_reply_job_id),
 'answers',coalesce((select jsonb_agg(jsonb_build_object('key',a.key,'label',coalesce((select fld->>'label' from jsonb_array_elements(s.form_snapshot->'fields')fld where fld->>'key'=a.key limit 1),a.key),'value',a.value)) from public.crm_submissions s cross join lateral jsonb_each(s.answers)a where s.id=p.submission_id),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(x) from(select a.action,a.note,a.created_at,t.full_name actor_name from public.crm_inquiry_actions a left join public.team_members t on t.id=a.actor_id where a.inquiry_id=p.id order by a.created_at desc,a.id limit 20)x),'[]'::jsonb))) from page p),'[]'::jsonb),
 'notifications',(select jsonb_build_object('queued',count(*)filter(where status in ('queued','leased','sending')),'needs_review',count(*)filter(where status='needs_review'),'blocked',count(*)filter(where status='blocked'),'accepted',count(*)filter(where status='accepted')) from public.crm_inquiry_notifications),
 'total',(select count(*) from filtered),'page',p_page,'page_size',50,'counts',(select jsonb_build_object('total',count(*),'due',count(*)filter(where not closed and unanswered and due_at<=now()),'unanswered',count(*)filter(where not closed and unanswered),'snoozed',count(*)filter(where not closed and snoozed),'answered',count(*)filter(where not closed and state='answered'),'dismissed',count(*)filter(where not closed and state='dismissed'),'closed',count(*)filter(where closed))from base)) into result;
 return result;
end $$;

-- Office-only email, frozen payload, two milestones, safe lease recovery.
create function public.crm_claim_inquiry_notifications(p_recipient text,p_limit integer default 5) returns setof public.crm_inquiry_notifications language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_recipient !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(p_recipient)>254 then raise exception 'Invalid office recipient';end if;
 update public.crm_inquiry_notifications set status='queued',lease_token=null,locked_at=null where status='leased' and locked_at<now()-interval '5 minutes';
 update public.crm_inquiry_notifications set status='needs_review',lease_token=null,locked_at=null where status='sending' and locked_at<now()-interval '5 minutes';
 update public.crm_inquiry_notifications n set status='cancelled' from public.crm_inquiry_followups f where f.id=n.inquiry_id and n.status in ('queued','leased') and (f.reminder_cycle<>n.cycle or f.state in ('answered','dismissed') or not public.crm_inquiry_eligible(f.project_id,f.client_id));
 insert into public.crm_inquiry_notifications(inquiry_id,cycle,milestone,recipient,subject,body)
 select f.id,f.reminder_cycle,1,p_recipient,'Inquiry needs a personal reply · Oceano Blue',o.title||E'\nPlease review this unanswered inquiry in the Ops Inquiry inbox. Automatic acknowledgments do not count as a personal reply.' from public.crm_inquiry_followups f join public.crm_opportunities o on o.project_id=f.project_id
 where f.due_at<=now() and f.state in ('open','snoozed') and (f.snoozed_until is null or f.snoozed_until<=now()) and public.crm_inquiry_eligible(f.project_id,f.client_id) on conflict(inquiry_id,cycle,milestone) do nothing;
 insert into public.crm_inquiry_notifications(inquiry_id,cycle,milestone,recipient,subject,body)
 select f.id,f.reminder_cycle,2,p_recipient,'Follow-up: inquiry still needs a reply · Oceano Blue',o.title||E'\nThis inquiry is still waiting for a personal reply. Review, snooze or dismiss it in the Ops Inquiry inbox.' from public.crm_inquiry_followups f join public.crm_opportunities o on o.project_id=f.project_id join public.crm_inquiry_notifications n on n.inquiry_id=f.id and n.cycle=f.reminder_cycle and n.milestone=1 and n.status='accepted' and n.accepted_at<=now()-interval '48 hours'
 where f.due_at+interval '48 hours'<=now() and f.state in ('open','snoozed') and (f.snoozed_until is null or f.snoozed_until<=now()) and public.crm_inquiry_eligible(f.project_id,f.client_id) on conflict(inquiry_id,cycle,milestone) do nothing;
 return query with candidates as(select n.id from public.crm_inquiry_notifications n join public.crm_inquiry_followups f on f.id=n.inquiry_id where n.status='queued' and (f.snoozed_until is null or f.snoozed_until<=now()) order by n.created_at,n.id limit greatest(1,least(p_limit,10)) for update of n skip locked)
 update public.crm_inquiry_notifications n set status='leased',lease_token=gen_random_uuid(),locked_at=now() from candidates c where n.id=c.id returning n.*;
end $$;
create function public.crm_prepare_inquiry_notification(p_id uuid,p_lease uuid,p_recipient text) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n public.crm_inquiry_notifications%rowtype;f public.crm_inquiry_followups%rowtype;begin
 select * into n from public.crm_inquiry_notifications where id=p_id and lease_token=p_lease and status='leased';if not found then return false;end if;
 select * into f from public.crm_inquiry_followups where id=n.inquiry_id for update;
 select * into n from public.crm_inquiry_notifications where id=p_id and lease_token=p_lease and status='leased' for update;if not found then return false;end if;
 if n.recipient is distinct from p_recipient then update public.crm_inquiry_notifications set status='blocked' where id=n.id;return false;end if;
 if f.reminder_cycle<>n.cycle or f.state not in ('open','snoozed') or not public.crm_inquiry_eligible(f.project_id,f.client_id) then update public.crm_inquiry_notifications set status='cancelled' where id=n.id;return false;end if;
 if f.snoozed_until>now() then update public.crm_inquiry_notifications set status='queued',lease_token=null,locked_at=null where id=n.id;return false;end if;
 update public.crm_inquiry_notifications set status='sending',first_attempt_at=coalesce(first_attempt_at,now()) where id=n.id;return true;
end $$;
create function public.crm_finish_inquiry_notification(p_id uuid,p_lease uuid,p_status text,p_provider text) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_status not in ('accepted','needs_review','blocked') or (p_status='accepted' and coalesce(p_provider,'')='') then return false;end if;
 update public.crm_inquiry_notifications set status=p_status,provider_id=p_provider,accepted_at=case when p_status='accepted' then now() end,lease_token=null,locked_at=null where id=p_id and lease_token=p_lease and status='sending';return found;
end $$;
-- Every callable routine is server-only. Office identity is independently checked
-- for browser actions/listing; worker routines never accept a client recipient.
do $$ declare sig text;begin
 foreach sig in array array['crm_inquiry_eligible(uuid,uuid)','crm_capture_inquiry()','crm_inquiry_action(uuid,text,uuid,integer,jsonb)','crm_inquiry_reply_accepted()','crm_inquiry_page(uuid,text,text,integer)','crm_claim_inquiry_notifications(text,integer)','crm_prepare_inquiry_notification(uuid,uuid,text)','crm_finish_inquiry_notification(uuid,uuid,text,text)'] loop
 execute 'revoke all on function public.'||sig||' from public,anon,authenticated';
 execute 'grant execute on function public.'||sig||' to service_role';
 end loop;
end $$;

-- Per-job guard is needed because other manual project emails remain eligible
-- after booking. Only explicitly linked unanswered-inquiry replies are stopped.
alter function public.crm_prepare_acquisition(uuid,uuid,boolean) rename to crm_prepare_acquisition_before_inbox;
create function public.crm_prepare_acquisition(p_id uuid,p_lease uuid,p_configured boolean) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare reply public.crm_inquiry_replies%rowtype;f public.crm_inquiry_followups%rowtype;j public.crm_acquisition_jobs%rowtype;begin
 select * into reply from public.crm_inquiry_replies where job_id=p_id;
 if found then
  select * into f from public.crm_inquiry_followups where id=reply.inquiry_id;
  perform 1 from public.crm_opportunities where project_id=f.project_id for share;
  select * into j from public.crm_acquisition_jobs where id=p_id and lease_token=p_lease and status='leased' for update;
  if not found then return jsonb_build_object('skip',true);end if;
  select * into f from public.crm_inquiry_followups where id=reply.inquiry_id for share;
  if f.queued_reply_job_id is distinct from p_id or f.cycle<>reply.cycle or f.state not in ('open','snoozed') or not public.crm_inquiry_eligible(f.project_id,f.client_id) or not exists(select 1 from public.clients where id=f.client_id and email=j.recipient) then
   update public.crm_acquisition_jobs set status='cancelled',last_error='Inquiry state or recipient changed. Review before replying.' where id=j.id;return jsonb_build_object('skip',true);
  end if;
 end if;
 return public.crm_prepare_acquisition_before_inbox(p_id,p_lease,p_configured);
end $$;
revoke all on function public.crm_prepare_acquisition(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.crm_prepare_acquisition(uuid,uuid,boolean) to service_role;
create function public.crm_inquiry_notification_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$begin
 if new.id<>old.id or new.inquiry_id<>old.inquiry_id or new.cycle<>old.cycle or new.milestone<>old.milestone or new.recipient<>old.recipient or new.subject<>old.subject or new.body<>old.body or new.created_at<>old.created_at then raise exception 'Office notification payload is immutable';end if;
 if old.first_attempt_at is not null and new.first_attempt_at is distinct from old.first_attempt_at then raise exception 'First notification attempt is immutable';end if;
 if old.status in ('accepted','needs_review','blocked','cancelled') and new is distinct from old then raise exception 'Terminal notification outcome is immutable';end if;
 return new;end $$;
revoke all on function public.crm_inquiry_notification_guard() from public,anon,authenticated;
create trigger crm_inquiry_notification_guard before update on public.crm_inquiry_notifications for each row execute function public.crm_inquiry_notification_guard();
create function public.crm_inquiry_detail(p_actor uuid,p_id uuid) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Office access required.');end if;
 return(select to_jsonb(f)||jsonb_build_object('title',o.title,'project_type',o.project_type,'project_date',o.project_date,'client_name',c.full_name,'client_email',c.email,'answers',coalesce((select jsonb_agg(jsonb_build_object('key',a.key,'label',coalesce((select fld->>'label' from jsonb_array_elements(s.form_snapshot->'fields')fld where fld->>'key'=a.key limit 1),a.key),'value',a.value)) from public.crm_submissions s cross join lateral jsonb_each(s.answers)a where s.id=f.submission_id),'[]'::jsonb),'closed',not public.crm_inquiry_eligible(f.project_id,f.client_id)) from public.crm_inquiry_followups f join public.crm_opportunities o on o.project_id=f.project_id join public.clients c on c.id=f.client_id where f.id=p_id);
end $$;
revoke all on function public.crm_inquiry_detail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_inquiry_detail(uuid,uuid) to service_role;
