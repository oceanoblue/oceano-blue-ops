import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
let db:PGlite;
const actor=randomUUID(),client=randomUUID(),contractor=randomUUID();
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 create table team_members(id uuid primary key,full_name text,role text,is_active boolean);
 alter table team_members enable row level security;create policy own_team on team_members for select to authenticated using(id=auth.uid());grant select on team_members to authenticated,service_role;
 create table clients(id uuid primary key default gen_random_uuid(),full_name text,email text unique,phone text,brokerage text,notes text,billing_address text,is_archived boolean default false,created_at timestamptz default now(),updated_at timestamptz default now());
 create table projects(id uuid primary key default gen_random_uuid(),client_id uuid references clients(id),name text,description text,start_date date,created_by uuid,metadata jsonb default '{}',status text default 'active',updated_at timestamptz default now());
 grant select,insert,update on clients,projects to service_role;
 insert into team_members values('${actor}','Office','admin',true),('${contractor}','Field','photographer',true);
 insert into clients(id,full_name,email) values('${client}','Test Client','client@example.test');`);
 for(const file of ['20261017032908_crm_clientflow.sql','20261017034047_crm_historical_archive.sql','20261017042746_crm_acquisition_workflows.sql','20261017043251_crm_acquisition_booked_files.sql','20261017114950_crm_onboarding_email.sql','20261018183631_crm_inquiry_inbox.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
},60000);
afterAll(async()=>await db?.close());beforeEach(async()=>{await db.exec('begin');});afterEach(async()=>{await db.exec('rollback');});
const query=async(sql:string,args:any[]=[])=> (await db.query<any>(sql,args)).rows;
async function makeProject(){
 const id=randomUUID();await db.query('insert into projects(id,client_id,name)values($1,$2,$3)',[id,client,'Commercial filming']);
 await db.query("insert into crm_opportunities(id,project_id,client_id,title,stage_id,owner_id)select gen_random_uuid(),$1,$2,'Commercial filming',id,$3 from crm_stages where name='Inquiry'",[id,client,actor]);return id;
}
async function enroll(project?:string){const pid=project||await makeProject();const res=await action('enroll_project',pid,{message:'Brand film for a small business',source:'Verified source inbox',received_at:new Date(Date.now()-90000000).toISOString(),note:'Office reviewed the current inquiry'},null);return{...res,project:pid};}
async function action(kind:string,id:string,data:unknown,version:number|null=1,who=actor){return(await query('select crm_inquiry_action($1,$2,$3,$4,$5::jsonb)result',[who,kind,id,version,JSON.stringify(data)]))[0].result;}
async function page(status='unanswered',p=0){return(await query('select crm_inquiry_page($1,$2,$3,$4)result',[actor,'',status,p]))[0].result;}
async function claim(){return query("select * from crm_claim_inquiry_notifications('office@example.test',5)");}
async function prepare(n:any){return(await query("select crm_prepare_inquiry_notification($1,$2,'office@example.test')ok",[n.id,n.lease_token]))[0].ok;}
async function accepted(job:string){const j=(await query('select * from crm_claim_acquisition(5)')).find(j=>j.id===job);expect(j).toBeTruthy();await query('select crm_prepare_acquisition($1,$2,true)',[job,j.lease_token]);await query("select crm_finish_acquisition($1,$2,'accepted','provider_test')",[job,j.lease_token]);}
it('does not enroll historical projects or existing submissions; future actual form submissions enroll once',async()=>{
 const pid=await makeProject();expect((await page()).total).toBe(0);
 const fid=(await query('select id from crm_forms limit 1'))[0].id;
 const sid=randomUUID();await db.query("insert into crm_submissions(id,form_id,client_id,project_id,payload_hash,answers,form_snapshot)values($1,$2,$3,$4,'hash',$5::jsonb,$6::jsonb)",[sid,fid,client,pid,JSON.stringify({message:'Product film',company:'Company',email:'client@example.test'}),JSON.stringify({fields:[{key:'company',label:'Company name'}]})]);
 const result=await page();expect(result.total).toBe(1);expect(result.inquiries[0]).toMatchObject({submission_id:sid,state:'open',message:'Product film'});expect(result.inquiries[0].answers).toContainEqual({key:'company',label:'Company name',value:'Company'});
 expect(await enroll(pid)).toMatchObject({already_enrolled:true});expect((await page()).total).toBe(1);
});
it('queues only reviewed custom replies idempotently, and autoack acceptance never marks answered',async()=>{
 const r=await enroll();const auto=randomUUID();await db.query("insert into crm_acquisition_jobs(id,project_id,client_id,recipient,subject,body,context,status,due_at)values($1,$2,$3,'client@example.test','Acknowledgment','Received','{}','queued',now())",[auto,r.project,client]);await accepted(auto);expect((await page()).inquiries[0].state).toBe('open');
 const data={request_id:randomUUID(),subject:'Your film plans',body:'Could you share the main objective?'};
 expect(await action('send_reply',r.id,data)).toMatchObject({job_id:data.request_id,version:2});expect(await action('send_reply',r.id,data)).toMatchObject({already_queued:true});
 expect(await action('send_reply',r.id,{...data,request_id:randomUUID()},2)).toHaveProperty('error');await accepted(data.request_id);expect((await page('answered')).inquiries[0]).toMatchObject({state:'answered',response_channel:'email'});
});
it('keeps ambiguous client sends unanswered and blocks another reply pending review',async()=>{
 const r=await enroll(),jid=randomUUID();await action('send_reply',r.id,{request_id:jid,subject:'Scope',body:'Please share the brief.'});
 await db.query("update crm_acquisition_jobs set status='needs_review' where id=$1",[jid]);expect((await page()).total).toBe(1);expect(await action('send_reply',r.id,{request_id:randomUUID(),subject:'Scope',body:'Second'},2)).toHaveProperty('error');
});
it('cancels superseded blocked replies and enforces the exact current reply at preflight',async()=>{
 const r=await enroll(),old=randomUUID(),current=randomUUID();await action('send_reply',r.id,{request_id:old,subject:'Scope',body:'First'});
 await db.query("update crm_acquisition_jobs set status='blocked' where id=$1",[old]);await action('send_reply',r.id,{request_id:current,subject:'Scope',body:'Reviewed second'},2);
 expect((await query('select status from crm_acquisition_jobs where id=$1',[old]))[0].status).toBe('cancelled');
 await db.query("update crm_acquisition_jobs set status='queued' where id=$1",[old]);const jobs=await query('select * from crm_claim_acquisition(5)');const stale=jobs.find(j=>j.id===old);expect((await query('select crm_prepare_acquisition($1,$2,true)r',[old,stale.lease_token]))[0].r).toEqual({skip:true});
});
it('rechecks booked projects, archived contacts and changed recipient before sending',async()=>{
 for(const mode of ['booked','archived','recipient']){
  const r=await enroll(),jid=randomUUID();await action('send_reply',r.id,{request_id:jid,subject:'Scope',body:'Reply'});const job=(await query('select * from crm_claim_acquisition(5)')).find(j=>j.id===jid);
  if(mode==='booked')await db.query("update crm_opportunities set stage_id=(select id from crm_stages where outcome='won' limit 1)where project_id=$1",[r.project]);
  else if(mode==='archived')await db.query('update clients set is_archived=true where id=$1',[client]);else await db.query("update clients set email='changed@example.test' where id=$1",[client]);
  expect((await query('select crm_prepare_acquisition($1,$2,true)r',[jid,job.lease_token]))[0].r).toEqual({skip:true});await db.query("update clients set is_archived=false,email='client@example.test' where id=$1",[client]);
 }
});
it('uses versioned explicit office response tracking, snoozes, dismisses and prevents old-cycle acceptance',async()=>{
 const r=await enroll();expect(await action('snooze',r.id,{until:new Date(Date.now()+3600000).toISOString(),note:'Waiting on producer'})).toMatchObject({version:2});expect((await page('snoozed')).total).toBe(1);expect(await claim()).toHaveLength(0);
 expect(await action('answered',r.id,{channel:'phone',note:'Called and discussed the scope'},1)).toHaveProperty('error');expect(await action('answered',r.id,{channel:'phone',note:'Called and discussed the scope'},2)).toMatchObject({version:3});expect((await page('answered')).total).toBe(1);
 expect(await action('reopen',r.id,{note:'Client sent a new question'},3)).toMatchObject({version:4});expect((await page()).inquiries[0].state).toBe('open');
 expect(await action('dismiss',r.id,{note:'Duplicate inquiry'},4)).toMatchObject({version:5});expect((await page('dismissed')).total).toBe(1);
});
it('leases one office reminder, deduplicates claims and does not blast both milestones after downtime',async()=>{
 const r=await enroll();await db.query("update crm_inquiry_followups set due_at=now()-interval '10 days' where id=$1",[r.id]);
 const [n]=await claim();expect(n.recipient).toBe('office@example.test');expect(await claim()).toHaveLength(0);expect(await prepare(n)).toBe(true);
 await query("select crm_finish_inquiry_notification($1,$2,'accepted','provider_office')",[n.id,n.lease_token]);expect(await claim()).toHaveLength(0);
 await db.exec("alter table crm_inquiry_notifications disable trigger crm_inquiry_notification_guard;update crm_inquiry_notifications set accepted_at=now()-interval '49 hours';alter table crm_inquiry_notifications enable trigger crm_inquiry_notification_guard;");
 const second=await claim();expect(second).toHaveLength(1);expect(second[0].milestone).toBe(2);
});
it('recovers an unattempted lease, quarantines interrupted sending and rechecks snooze/answer before provider',async()=>{
 const r=await enroll();let[n]=await claim();await db.query("update crm_inquiry_notifications set locked_at=now()-interval '6 minutes' where id=$1",[n.id]);[n]=await claim();expect(n.status).toBe('leased');expect(await prepare(n)).toBe(true);
 await db.query("update crm_inquiry_notifications set locked_at=now()-interval '6 minutes' where id=$1",[n.id]);expect(await claim()).toHaveLength(0);expect((await query('select status from crm_inquiry_notifications where id=$1',[n.id]))[0].status).toBe('needs_review');
 expect((await page()).notifications.needs_review).toBe(1);
 const r2=await enroll();const[n2]=await claim();await action('answered',r2.id,{channel:'email',note:'Replied from office inbox'});expect(await prepare(n2)).toBe(false);
});
it('protects office-only RPCs, RLS, append-only actions and frozen notification payloads',async()=>{
 const r=await enroll();expect(await action('dismiss',r.id,{note:'No'},1,contractor)).toEqual({error:'Office access required.'});
 expect((await query("select has_function_privilege('anon','crm_inquiry_action(uuid,text,uuid,integer,jsonb)','execute')x,has_table_privilege('authenticated','crm_inquiry_followups','update')y"))[0]).toEqual({x:false,y:false});
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[contractor]);await db.exec('set local role authenticated');expect(await query('select * from crm_inquiry_followups')).toHaveLength(0);await db.exec('reset role');
 const[n]=await claim();await db.exec('savepoint guard');await expect(db.query("update crm_inquiry_notifications set recipient='client@example.test' where id=$1",[n.id])).rejects.toThrow('immutable');await db.exec('rollback to savepoint guard');
 await expect(db.query("update crm_inquiry_actions set note='replacement' where inquiry_id=$1",[r.id])).rejects.toThrow('append-only');
});
it('paginates with global counts and keeps closed projects out of unanswered counts',async()=>{
 for(let i=0;i<53;i++)await enroll();expect((await page()).inquiries).toHaveLength(50);expect((await page('unanswered',1)).inquiries).toHaveLength(3);expect((await page('unanswered',1)).counts.unanswered).toBe(53);
 await db.exec("update crm_opportunities set stage_id=(select id from crm_stages where outcome='won' limit 1)");expect((await page()).counts).toMatchObject({unanswered:0,closed:53});expect((await page('closed')).total).toBe(53);
});

it('snooze re-arms after both old reminder milestones and wakes at the requested time',async()=>{
 const r=await enroll();let[n]=await claim();await prepare(n);await query("select crm_finish_inquiry_notification($1,$2,'accepted','first')",[n.id,n.lease_token]);
 await db.exec("alter table crm_inquiry_notifications disable trigger crm_inquiry_notification_guard;update crm_inquiry_notifications set accepted_at=now()-interval '49 hours';alter table crm_inquiry_notifications enable trigger crm_inquiry_notification_guard;");
 await db.query("update crm_inquiry_followups set due_at=now()-interval '4 days' where id=$1",[r.id]);[n]=await claim();await prepare(n);await query("select crm_finish_inquiry_notification($1,$2,'accepted','second')",[n.id,n.lease_token]);
 await action('snooze',r.id,{until:new Date(Date.now()+3600000).toISOString(),note:'Producer follow-up tomorrow'});expect(await claim()).toHaveLength(0);
 await db.query("update crm_inquiry_followups set due_at=now()-interval '1 minute',snoozed_until=now()-interval '1 minute' where id=$1",[r.id]);const wake=await claim();expect(wake).toHaveLength(1);expect(wake[0]).toMatchObject({cycle:1,milestone:1});
});
it('a reviewed queued reply survives snooze and marks answered when accepted',async()=>{
 const r=await enroll(),jid=randomUUID();await action('send_reply',r.id,{request_id:jid,subject:'Scope',body:'Reviewed reply'});await action('snooze',r.id,{until:new Date(Date.now()+3600000).toISOString(),note:'Wait for office review'},2);await accepted(jid);
 expect((await page('answered')).inquiries[0]).toMatchObject({state:'answered',reply_job_id:jid});
});
it('blocks an old frozen office recipient when configuration changes before preflight',async()=>{
 await enroll();const[n]=await claim();expect((await query("select crm_prepare_inquiry_notification($1,$2,'new-office@example.test')ok",[n.id,n.lease_token]))[0].ok).toBe(false);
 expect((await query('select status from crm_inquiry_notifications where id=$1',[n.id]))[0].status).toBe('blocked');
});
it('does not close a new inquiry cycle when an already in-flight old reply is later accepted',async()=>{
 const r=await enroll(),jid=randomUUID();await action('send_reply',r.id,{request_id:jid,subject:'Scope',body:'First reply'});const[j]=await query('select * from crm_claim_acquisition(5)');await query('select crm_prepare_acquisition($1,$2,true)',[jid,j.lease_token]);
 await action('dismiss',r.id,{note:'Duplicate review'},2);await action('reopen',r.id,{note:'New source question'},3);
 await query("select crm_finish_acquisition($1,$2,'accepted','late-provider')",[jid,j.lease_token]);expect((await page()).inquiries[0]).toMatchObject({state:'open',cycle:1});
});
