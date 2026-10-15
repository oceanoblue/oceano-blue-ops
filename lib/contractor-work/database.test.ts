import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { agreementSnapshot } from './types';
import { ESIGN_CONSENT } from './template';
let db:PGlite;
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333',staff='44444444-4444-4444-8444-444444444444';
const ca='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',cb='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otp='a'.repeat(64);
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create table public.team_members(id uuid primary key,role text,is_active boolean,email text);
    create table public.contractors(id uuid primary key,auth_user_id uuid,email text,is_active boolean);
    create table public.projects(id uuid primary key);
    create table public.orders(id uuid primary key,status text default 'scheduled');
    create function public.current_contractor_id() returns uuid language sql stable security definer set search_path=public as $$ select id from contractors where auth_user_id=auth.uid() and is_active limit 1 $$;
    alter table team_members enable row level security;alter table contractors enable row level security;
    create policy own_team on team_members for select to authenticated using(id=auth.uid());
    create policy own_contractor on contractors for select to authenticated using(auth_user_id=auth.uid());
    grant select on team_members,contractors to authenticated;grant all on team_members,contractors,projects,orders to service_role;
    insert into team_members values('${admin}','admin',true,'admin@example.invalid'),('${staff}','photographer',true,'staff@example.invalid');
    insert into contractors values('${ca}','${alice}','alice@example.invalid',true),('${cb}','${bob}','bob@example.invalid',true);
  `);
  await db.exec(readFileSync('supabase/migrations/20261015162353_contractor_agreements_video_intake.sql','utf8'));
},60000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec('begin');});afterEach(async()=>{await db.exec('rollback');});
async function draft(owner=ca){const r=await db.query<Record<string,any>>(`insert into contractor_agreements(contractor_id,company_legal_name,contractor_legal_name,contractor_email,body_text,esign_consent,created_by,last_actor_id) values($1,'Example Company LLC',$2,$3,$4,$5,$6,$6) returning *`,[owner,owner===ca?'Alice Example':'Bob Example',owner===ca?'alice@example.invalid':'bob@example.invalid','Commissioned work terms, accents: Océano.\n'.repeat(6),ESIGN_CONSENT,admin]);return r.rows[0];}
async function issue(a:Record<string,any>){await db.query(`update contractor_agreements set status='issued',company_signature=$2::jsonb where id=$1`,[a.id,JSON.stringify({name:'Admin Example',email:'admin@example.invalid',user_id:admin,at:new Date().toISOString(),consent:ESIGN_CONSENT,method:'test-only signature'})]);}
async function request(a:Record<string,any>,actor=alice){return (await db.query<{r:any}>('select request_contractor_signature_code($1,$2,$3) r',[a.id,actor,otp])).rows[0].r;}
async function sign(a:Record<string,any>,actor=alice,code=otp,hash=a.document_hash){return (await db.query<{r:any}>('select complete_contractor_signature($1,$2,$3,$4,$5,$6) r',[a.id,actor,code,'Alice Example',hash,'local-test-browser'])).rows[0].r;}
async function asUser(who:string){await db.query(`select set_config('request.jwt.claim.sub',$1,true)`,[who]);await db.exec('set local role authenticated');}

describe('contractor agreements: database and signature controls',()=>{
  it('does not seed any real agreements or handoffs',async()=>{expect((await db.query('select * from contractor_agreements')).rows).toHaveLength(0);expect((await db.query('select * from contractor_video_intakes')).rows).toHaveLength(0);});
  it('uses the same canonical UTF-8 hash in SQL and the application',async()=>{const a=await draft();expect(a.document_hash).toBe(createHash('sha256').update(agreementSnapshot(a as any),'utf8').digest('hex'));});
  it('records draft creation and issuance without storing a signing code',async()=>{const a=await draft();await issue(a);const r=await db.query<{kind:string;details:any}>('select kind,details from contractor_agreement_events order by created_at');expect(r.rows.map(e=>e.kind)).toEqual(['draft_created','issued']);expect(JSON.stringify(r.rows)).not.toContain('code_hash');});
  it('keeps issued documents and company signatures immutable',async()=>{const a=await draft();await issue(a);await expect(db.query('update contractor_agreements set body_text=$2 where id=$1',[a.id,'new terms '.repeat(30)])).rejects.toThrow(/immutable/);});
  it('does not let client roles invoke signing RPCs or read code hashes',async()=>{const r=await db.query<Record<string,boolean>>(`select has_function_privilege('authenticated','public.complete_contractor_signature(uuid,uuid,text,text,text,text)','EXECUTE') as client_execute,has_function_privilege('anon','public.request_contractor_signature_code(uuid,uuid,text)','EXECUTE') as anon_execute,has_function_privilege('service_role','public.complete_contractor_signature(uuid,uuid,text,text,text,text)','EXECUTE') as service_execute,has_table_privilege('authenticated','public.contractor_signature_challenges','SELECT') as client_codes`);expect(r.rows[0]).toEqual({client_execute:false,anon_execute:false,service_execute:true,client_codes:false});});
  it('scopes agreement and event reads to the contractor',async()=>{const a=await draft();const b=await draft(cb);await issue(a);await issue(b);await asUser(alice);expect((await db.query('select id from contractor_agreements')).rows).toEqual([{id:a.id}]);expect((await db.query('select distinct agreement_id from contractor_agreement_events')).rows).toEqual([{agreement_id:a.id}]);});
  it('does not expose unsigned drafts to contractors before issuance',async()=>{await draft();await asUser(alice);expect((await db.query('select id from contractor_agreements')).rows).toHaveLength(0);});
  it('does not make a photographer an agreement administrator',async()=>{const a=await draft();await issue(a);await asUser(staff);expect((await db.query('select * from contractor_agreements')).rows).toHaveLength(0);});
  it('denies direct contractor updates even to its own agreement',async()=>{const a=await draft();await asUser(alice);await expect(db.query('update contractor_agreements set status=$2 where id=$1',[a.id,'void'])).rejects.toThrow(/permission denied/);});
  it('binds a signing code to the active assigned contractor',async()=>{const a=await draft();await issue(a);expect(await request(a,bob)).toEqual({error:'forbidden'});expect((await db.query('select * from contractor_signature_challenges')).rows).toHaveLength(0);});
  it('throttles rapid code requests',async()=>{const a=await draft();await issue(a);expect(await request(a)).toEqual({ok:true});expect(await request(a)).toEqual({error:'wait_60_seconds'});});
  it('enforces the rolling hourly code limit',async()=>{const a=await draft();await issue(a);await request(a);await db.exec("update contractor_signature_challenges set requested_at=now()-interval '2 minutes',window_count=5");expect(await request(a)).toEqual({error:'signing_code_hourly_limit'});});
  it('persists wrong-code attempts and locks after five guesses',async()=>{const a=await draft();await issue(a);await request(a);for(let i=0;i<5;i++)expect(await sign(a,alice,'b'.repeat(64))).toEqual({error:'incorrect_signing_code'});expect(await sign(a)).toEqual({error:'request_new_signing_code'});expect((await db.query<{attempts:number}>('select attempts from contractor_signature_challenges')).rows[0].attempts).toBe(5);});
  it('rejects expired codes',async()=>{const a=await draft();await issue(a);await request(a);await db.exec("update contractor_signature_challenges set expires_at=now()-interval '1 minute'");expect(await sign(a)).toEqual({error:'request_new_signing_code'});});
  it('rejects a different document fingerprint',async()=>{const a=await draft();await issue(a);await request(a);expect(await sign(a,alice,otp,'b'.repeat(64))).toEqual({error:'document_changed_reload'});});
  it('signs exactly once, records consent and consumes the challenge',async()=>{const a=await draft();await issue(a);await request(a);expect(await sign(a)).toEqual({ok:true});const r=await db.query<Record<string,any>>('select * from contractor_agreements where id=$1',[a.id]);expect(r.rows[0].status).toBe('executed');expect(r.rows[0].contractor_signature.consent).toBe(ESIGN_CONSENT);expect(r.rows[0].contractor_signature.email).toBe('alice@example.invalid');expect((await db.query('select * from contractor_signature_challenges')).rows).toHaveLength(0);expect(await sign(a)).toEqual({error:'agreement_not_signable'});});
  it('does not allow a completed agreement to be voided',async()=>{const a=await draft();await issue(a);await request(a);await sign(a);await expect(db.query("update contractor_agreements set status='void' where id=$1",[a.id])).rejects.toThrow(/immutable/);});
  it('retains audit events',async()=>{await draft();await expect(db.exec('delete from contractor_agreement_events')).rejects.toThrow(/append-only/);});
  it('requires an active contractor at the instant of signature',async()=>{const a=await draft();await issue(a);await request(a);await db.query('update contractors set is_active=false where id=$1',[ca]);expect(await sign(a)).toEqual({error:'forbidden'});});
});
describe('isolated video intake',()=>{
  it('scopes handoffs and denies direct browser writes',async()=>{await db.query(`insert into contractor_video_intakes(contractor_id,title,created_by) values($1,'Alice test handoff',$3),($2,'Bob test handoff',$3)`,[ca,cb,admin]);await asUser(alice);expect((await db.query<{title:string}>('select title from contractor_video_intakes')).rows).toEqual([{title:'Alice test handoff'}]);expect((await db.query<{can_update:boolean}>("select has_table_privilege('authenticated','contractor_video_intakes','UPDATE') can_update")).rows[0].can_update).toBe(false);});
  it('does not permit submitted status without verified media and confirmations',async()=>{await expect(db.query(`insert into contractor_video_intakes(contractor_id,title,created_by,status) values($1,'Empty upload',$2,'submitted')`,[ca,admin])).rejects.toThrow(/check constraint/);});
  it('does not advance photo orders when a video handoff is created',async()=>{await db.query('insert into orders(id) values($1)',[staff]);await db.query('insert into contractor_video_intakes(contractor_id,title,created_by,order_id) values($1,$2,$3,$4)',[ca,'Linked video only',admin,staff]);expect((await db.query('select status from orders')).rows).toEqual([{status:'scheduled'}]);});
});
