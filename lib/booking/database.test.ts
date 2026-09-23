import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { productCaptureSkills } from './capture-skills';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';

let db: PGlite;
const photographer = '11111111-1111-4111-8111-111111111111';
const product = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const hash = 'a'.repeat(64);
let payload: Record<string, unknown>;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create type project_type as enum ('mls_real_estate','luxury_real_estate','architectural','interior_design');
    create function is_team_member() returns boolean language sql as $$select false$$;
    create table clients(id uuid primary key default gen_random_uuid(), email text unique, full_name text, phone text, brokerage text);
    create table listings(id uuid primary key default gen_random_uuid(),client_id uuid,address_line1 text,address_line2 text,city text,state text,zip text,lat double precision,lng double precision,sqft int,bedrooms int,bathrooms numeric,access_method text,highlights text,status text);
    create type service_type as enum ('photography');
    create table order_services(order_id uuid,service_type service_type,description text,quantity int);
    create table orders(order_number int, rush boolean, order_kind text, download_paid_at timestamptz, archived_at timestamptz, id uuid primary key default gen_random_uuid(),listing_id uuid,client_id uuid,status text,scheduled_at timestamptz,duration_minutes int,timezone text,client_notes text,photographer_id uuid,subtotal_cents int,total_cents int,project_type project_type default 'mls_real_estate',contractor_id uuid,pay_amount_cents int);
    create table products(id uuid primary key,name text,duration_minutes int,is_active boolean,audiences text[]);
    create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid,product_id uuid,description text,quantity int,unit_price_cents int,total_cents int,duration_minutes int);
    create table activity_log(order_id uuid,listing_id uuid,actor_type text,action text,details jsonb);
    create table business_settings(id boolean primary key,buffer_minutes int,min_notice_hours int,max_notice_days int,default_timezone text);
    create table team_members(id uuid primary key,is_active boolean,role text,email text,phone text);
    create table team_availability(team_member_id uuid,is_active boolean,day_of_week int,start_local time,end_local time,timezone text);
    create table schedule_blocks(team_member_id uuid,is_available boolean,starts_at timestamptz,ends_at timestamptz);
    create table contractors(id uuid primary key,team_member_id uuid,is_active boolean,pay_rate_cents int);
    create function price_for_sqft(uuid,int) returns int language sql as $$select 20000$$;
  `);
  const triggerSource = readFileSync('supabase/migrations/0078_double_book_override.sql','utf8');
  const trigger = triggerSource.match(/create or replace function check_order_no_double_book\(\)[\s\S]*?\$\$;/i)?.[0];
  if (!trigger) throw new Error('Missing production overlap guard');
  await db.exec(trigger + `create trigger no_overlap before insert or update on orders for each row execute function check_order_no_double_book();`);
  await db.exec(readFileSync('supabase/migrations/20260908140351_reliable_public_booking.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260908141709_idempotent_order_pricing.sql','utf8'));
  const search = readFileSync('supabase/migrations/20260908140411_operations_search_and_health.sql','utf8').split('-- Cache the per-request')[0];
  await db.exec(search + 'commit;');
  await db.exec(`alter table orders add column contractor_response text, add column contractor_responded_at timestamptz, add column contractor_response_note text, add column updated_at timestamptz;
    alter table contractors add column full_name text, add column email text, add column phone text;`);
  await db.exec(readFileSync('supabase/migrations/20260920230259_client_rescheduling.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260921155310_photographer_dispatch.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260921165524_booking_auto_confirmation.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260921170607_booking_confirmation_workflow.sql','utf8'));
  await db.exec("alter table products add column kind text default 'photo'; alter table orders add column package_name text, add column internal_notes text; create type order_status as enum ('draft','booked','scheduled','shooting','delivered','cancelled');");
  await db.exec(readFileSync('supabase/migrations/20260923002221_staff_appointment_window.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260923005028_photo_video_crew.sql','utf8'));
  await db.exec('create table order_calendar_events(order_id uuid,calendar_id text,role text,unique(order_id,calendar_id))');
  await db.exec(readFileSync('supabase/migrations/20260923104656_manual_assignment_review.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260923110001_calendar_role_keys.sql','utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`truncate booking_followups,booking_requests,orders,order_items,order_services,listings,clients,activity_log,products,business_settings,team_members,team_availability,schedule_blocks,contractors cascade;
    insert into business_settings(id,buffer_minutes,min_notice_hours,max_notice_days,default_timezone) values(true,30,4,30,'America/New_York');
    insert into team_members values('${photographer}',true,'admin','office@example.test','+12025550123');
    insert into photographer_routing(team_member_id,enabled,capture_skills) values('${photographer}',true,array['photography','tour_360']);
    insert into products(id,name,duration_minutes,is_active,audiences) values('${product}','Photo',60,true,array['real_estate']);
    insert into team_availability select '${photographer}',true,d,'09:00','17:00','America/New_York' from generate_series(0,6) d;`);
  await db.exec('create or replace function is_team_member() returns boolean language sql as $$select true$$;');
  const { rows } = await db.query<{at: string}>(`select (((now() at time zone 'America/New_York')::date+2+time '10:00') at time zone 'America/New_York')::text as at`);
  payload = { client_email:'client@example.test',client_name:'Client',client_phone:'',client_brokerage:'',address_line1:'Test property',address_line2:'',city:'Bluffton',state:'SC',zip:'29910',sqft:2000,scheduled_at:rows[0].at,duration_minutes:60,timezone:'America/New_York',access_method:'',highlights:'',photographer_id:photographer,project_type:'mls_real_estate',items:[{product_id:product,quantity:1}] };
});

async function book(body = payload, key = requestId, bodyHash = hash) {
  return db.query<{id: string}>('select commit_public_booking($1::jsonb,$2::uuid,$3) as id',[JSON.stringify(body),key,bodyHash]);
}

describe('public booking transaction', () => {
  it('commits one booking and each independent follow-up, and returns the same booking on replay', async () => {
    const first = await book();
    expect((await book()).rows[0].id).toBe(first.rows[0].id);
    expect((await db.query('select count(*)::int as n from orders')).rows).toEqual([{n:1}]);
    expect((await db.query('select count(*)::int as n from booking_followups')).rows).toEqual([{n:4}]);
  });
  it('rejects reusing a key with different details', async () => {
    await book();
    await expect(book({...payload,client_name:'Changed'},requestId,'b'.repeat(64))).rejects.toThrow('idempotency_conflict');
  });
  it('preserves an existing client profile regardless of public booking contact input', async () => {
    await db.exec("insert into clients(email,full_name,phone,brokerage) values('client@example.test','Verified name','123','Original');");
    await book({...payload,client_name:'Unverified replacement',client_phone:'456'});
    expect((await db.query('select full_name,phone,brokerage from clients')).rows).toEqual([{full_name:'Verified name',phone:'123',brokerage:'Original'}]);
  });
  it('keeps the legacy draft route from overwriting client profiles', async () => {
    await db.exec("insert into clients(email,full_name,phone,brokerage) values('client@example.test','Verified','123','Original');");
    await db.query("select create_draft_order('client@example.test','Changed','456','Changed','Property','City','SC','29910',0,0,2000,now(),array['photography'],'')");
    expect((await db.query('select full_name,phone from clients')).rows).toEqual([{full_name:'Verified',phone:'123'}]);
  });
  it('rejects a booking outside working hours or beyond the booking horizon', async () => {
    await expect(book({...payload,scheduled_at:new Date(Date.parse(String(payload.scheduled_at))+9*3600000).toISOString()})).rejects.toThrow('slot_unavailable');
    await expect(book({...payload,scheduled_at:new Date(Date.parse(String(payload.scheduled_at))+40*86400000).toISOString()})).rejects.toThrow('slot_unavailable');
  });
  it('filters across status buckets, searches all rows, and paginates a stable order', async () => {
    await db.exec(`insert into orders(order_number,status,order_kind,total_cents) select n,case when n%2=0 then 'booked' else 'scheduled' end,'shoot',n*100 from generate_series(1,310) n;`);
    const found = await db.query<{result:{total:number,rows:any[]}}>("select search_operations_orders(array['booked','scheduled'],null,false,'','order',true,7,50) as result");
    expect(found.rows[0].result.total).toBe(310); expect(found.rows[0].result.rows).toHaveLength(10);
    expect(found.rows[0].result.rows[0].order_number).toBe(301);
    const search = await db.query<{result:{total:number}}>("select search_operations_orders(null,null,false,'310') as result");
    expect(search.rows[0].result.total).toBe(1);
    await db.exec('create or replace function is_team_member() returns boolean language sql as $$select false$$;');
    const denied = await db.query<{result:{total:number}}>('select search_operations_orders() as result');
    expect(denied.rows[0].result.total).toBe(0);
  });
  it('replays pricing without duplicate items and retains totals from other lines', async () => {
    const order = (await book()).rows[0].id;
    await db.query("insert into order_items(order_id,description,quantity,total_cents) values($1,'Custom service',1,5000)",[order]);
    const args = [order,JSON.stringify(payload.items),2000];
    await db.query('select add_order_items_priced($1,$2::jsonb,$3)',args);
    await db.query('select add_order_items_priced($1,$2::jsonb,$3)',args);
    expect((await db.query('select count(*)::int as n from order_items')).rows).toEqual([{n:2}]);
    expect((await db.query('select total_cents from orders')).rows).toEqual([{total_cents:25000}]);
    await expect(db.query('select add_order_items_priced($1,$2::jsonb,$3)',[order,JSON.stringify([{product_id:product,quantity:-1}]),2000])).rejects.toThrow('invalid_quantity');
    expect((await db.query('select total_cents from orders')).rows).toEqual([{total_cents:25000}]);
  });
  it('rejects a past booking', async () => { await expect(book({...payload,scheduled_at:'2020-01-01T14:00:00Z'})).rejects.toThrow('slot_unavailable'); });
  it('rejects long blocks that span the entire selected day', async () => {
    await db.query(`insert into schedule_blocks values($1,false,$2::timestamptz-interval '7 days',$2::timestamptz+interval '7 days')`,[photographer,payload.scheduled_at]);
    await expect(book()).rejects.toThrow('slot_unavailable');
  });
  it('rejects an existing photographer conflict atomically', async () => {
    await book();
    await expect(book(payload,'44444444-4444-4444-8444-444444444444')).rejects.toThrow('slot_unavailable');
    expect((await db.query('select count(*)::int as n from orders')).rows).toEqual([{n:1}]);
    expect((await db.query('select count(*)::int as n from listings')).rows).toEqual([{n:1}]);
  });
  it('rejects inactive services and invalid quantities', async () => {
    await db.exec('update products set is_active=false');
    await expect(book()).rejects.toThrow('invalid_product');
    await db.exec('update products set is_active=true');
    await expect(book({...payload,items:[{product_id:product,quantity:-1}]})).rejects.toThrow('invalid_quantity');
  });
  it('derives duration instead of trusting the client', async () => {
    await book({...payload,duration_minutes:15});
    expect((await db.query('select duration_minutes from orders')).rows).toEqual([{duration_minutes:60}]);
  });
  it('denies API roles direct execution and isolates follow-up data', async () => {
    expect((await db.query(`select has_function_privilege('anon','commit_public_booking(jsonb,uuid,text)','EXECUTE') as anon,
      has_function_privilege('authenticated','commit_public_booking(jsonb,uuid,text)','EXECUTE') as authenticated,
      has_function_privilege('service_role','commit_public_booking(jsonb,uuid,text)','EXECUTE') as service,
      has_table_privilege('anon','booking_followups','SELECT') as followups`)).rows).toEqual([{anon:false,authenticated:false,service:true,followups:false}]);
  });
  it('claims separate work and prevents two workers from claiming the same task', async () => {
    await book();
    const first = await db.query<{id:string}>('select id from claim_booking_followups(3)');
    const second = await db.query<{id:string}>('select id from claim_booking_followups(3)');
    expect(first.rows).toHaveLength(3);
    expect(second.rows).toHaveLength(1);
    expect(new Set([...first.rows,...second.rows].map(r=>r.id)).size).toBe(4);
  });
});

const backup='55555555-5555-4555-8555-555555555555';
const contractor='66666666-6666-4666-8666-666666666666';
async function enableDispatch(){
  await db.exec(`update business_settings set scheduling_dispatch_enabled=true;
    insert into photographer_routing(team_member_id,enabled,priority,product_ids) values('${photographer}',true,10,array['${product}'::uuid]) on conflict(team_member_id) do update set priority=10,product_ids=excluded.product_ids;
    insert into contractors(id,team_member_id,is_active,pay_rate_cents,full_name,email,phone) values('${contractor}','${photographer}',true,6000,'Photographer','photographer@example.test','+12025550124');
    insert into team_members values('${backup}',true,'photographer','backup@example.test',null);
    insert into photographer_routing(team_member_id,enabled,priority) values('${backup}',true,100);
    insert into team_availability select '${backup}',true,d,'09:00','17:00','America/New_York' from generate_series(0,6) d;`);
}
describe('photographer dispatch transaction',()=>{
  it('reserves contractor bookings and queues independent acceptance requests',async()=>{
    await enableDispatch();const id=(await book()).rows[0].id;
    const row=(await db.query<any>('select assignment_state,assignment_round,auto_dispatch from orders where id=$1',[id])).rows[0];
    expect(row).toEqual({assignment_state:'awaiting_response',assignment_round:1,auto_dispatch:true});
    const jobs=(await db.query<any>('select kind,payload from booking_followups')).rows;
    expect(jobs.map(x=>x.kind)).toContain('assignment_email');expect(jobs.map(x=>x.kind)).toContain('assignment_sms');
    expect(jobs.find(x=>x.kind==='client_email').payload.event).toBe('assignment_pending');
    await book();expect((await db.query('select * from orders')).rows).toHaveLength(1);
  });
  it('confirms exactly once and sends a later decline back through dispatch',async()=>{
    await enableDispatch();const id=(await book()).rows[0].id;
    await db.query("update orders set contractor_response='accepted' where id=$1",[id]);
    await db.query("update orders set contractor_response='accepted' where id=$1",[id]);
    expect((await db.query<any>('select assignment_state from orders')).rows[0].assignment_state).toBe('confirmed');
    expect((await db.query("select * from booking_followups where payload->>'event'='assignment_confirmed'")).rows).toHaveLength(1);
    await db.query("update orders set contractor_response='declined' where id=$1",[id]);
    expect((await db.query<any>('select assignment_state from orders')).rows[0].assignment_state).toBe('rerouting');
    await expect(db.query("update orders set contractor_response='accepted' where id=$1",[id])).rejects.toThrow('assignment_expired');
  });
  it('routes a decline to an available backup and makes stale workers harmless',async()=>{
    await enableDispatch();const id=(await book()).rows[0].id;
    await db.query("update orders set contractor_response='declined' where id=$1",[id]);
    expect((await db.query<any>('select advance_photographer_assignment($1,1,$2) as ok',[id,backup])).rows[0].ok).toBe(true);
    expect((await db.query<any>('select photographer_id,assignment_state,assignment_round from orders')).rows[0]).toEqual({photographer_id:backup,assignment_state:'awaiting_response',assignment_round:2});
    expect((await db.query<any>('select advance_photographer_assignment($1,1,null) as ok',[id])).rows[0].ok).toBe(false);
    expect((await db.query("select * from booking_followups where kind='office_attention'")).rows).toHaveLength(1);
  });
  it('holds pending offers, rejects expired acceptance, and escalates when nobody can cover',async()=>{
    await enableDispatch();const id=(await book()).rows[0].id;
    expect((await db.query<any>('select advance_photographer_assignment($1,1,$2) as ok',[id,backup])).rows[0].ok).toBe(false);
    await db.query("update orders set assignment_due_at=now()-interval '1 minute' where id=$1",[id]);
    await expect(db.query("update orders set contractor_response='accepted' where id=$1",[id])).rejects.toThrow('assignment_expired');
    await db.query('select advance_photographer_assignment($1,1,null)',[id]);
    expect((await db.query<any>('select assignment_state,photographer_id from orders')).rows[0]).toEqual({assignment_state:'needs_attention',photographer_id:null});
  });
  it('rechecks eligibility, time off, and overlapping bookings before backup assignment',async()=>{
    await enableDispatch();const id=(await book()).rows[0].id;await db.query("update orders set contractor_response='declined' where id=$1",[id]);
    await db.exec(`update photographer_routing set enabled=false where team_member_id='${backup}'`);
    await expect(db.query('select advance_photographer_assignment($1,1,$2)',[id,backup])).rejects.toThrow('not eligible');
    await db.exec(`update photographer_routing set enabled=true where team_member_id='${backup}'`);
    await db.query(`insert into schedule_blocks values($1,false,$2::timestamptz,$2::timestamptz+interval '2 hours')`,[backup,payload.scheduled_at]);
    await expect(db.query('select advance_photographer_assignment($1,1,$2)',[id,backup])).rejects.toThrow('time off');
    await db.exec('delete from schedule_blocks');
    await db.query(`insert into orders(photographer_id,status,scheduled_at,duration_minutes) values($1,'booked',$2,60)`,[backup,payload.scheduled_at]);
    await expect(db.query('select advance_photographer_assignment($1,1,$2)',[id,backup])).rejects.toThrow('travel conflict');
  });
  it('enforces service permissions, ZIP coverage and cross-ZIP travel gaps at commit',async()=>{
    await enableDispatch();await db.exec(`update photographer_routing set product_ids='{}' where team_member_id='${photographer}'`);
    await expect(book()).rejects.toThrow('not eligible');
    await db.exec(`update photographer_routing set product_ids=null,service_zips=array['99999'] where team_member_id='${photographer}'`);
    await expect(book()).rejects.toThrow('not eligible');
    await db.exec(`update photographer_routing set service_zips='{}',cross_zip_minutes=90 where team_member_id='${photographer}'`);
    await book();const next=new Date(Date.parse(String(payload.scheduled_at))+120*60000).toISOString();
    await expect(book({...payload,scheduled_at:next,zip:'29928'},'77777777-7777-4777-8777-777777777777')).rejects.toThrow('travel conflict');
  });
  it('invalidates acceptance and disables automatic routing when the office reassigns',async()=>{
    await enableDispatch();const id=(await book()).rows[0].id;
    await db.query('update orders set photographer_id=$2,contractor_id=null where id=$1',[id,backup]);
    expect((await db.query<any>('select assignment_round,auto_dispatch,assignment_state from orders')).rows[0]).toEqual({assignment_round:2,auto_dispatch:false,assignment_state:'awaiting_response'});
  });
  it('restricts dispatch mutation and routing configuration to server roles',async()=>{
    const r=(await db.query<any>(`select has_function_privilege('authenticated','advance_photographer_assignment(uuid,integer,uuid)','EXECUTE') as mutate,
      has_function_privilege('anon','queue_assignment_events()','EXECUTE') as trigger,
      has_table_privilege('authenticated','photographer_routing','UPDATE') as config`)).rows[0];expect(r).toEqual({mutate:false,trigger:false,config:false});
  });
});

describe('dispatch rescheduling and hours',()=>{
  it('requires fresh acceptance after a client changes the time, with one calendar job and safe replay',async()=>{
    await enableDispatch();const id=(await book()).rows[0].id;
    await db.exec("update business_settings set client_reschedule_cutoff_hours=0");
    await db.query("update orders set contractor_response='accepted' where id=$1",[id]);
    const client=(await db.query<any>('select client_id from orders where id=$1',[id])).rows[0].client_id;
    const next=new Date(Date.parse(String(payload.scheduled_at))+86400000).toISOString();
    const args=['88888888-8888-4888-8888-888888888888',id,[client],payload.scheduled_at,next,photographer,60];
    await db.query('select commit_client_reschedule($1,$2,$3::uuid[],$4,$5,$6,$7)',args);
    expect((await db.query<any>('select assignment_state,assignment_round,contractor_response from orders')).rows[0]).toEqual({assignment_state:'awaiting_response',assignment_round:2,contractor_response:null});
    const jobs=(await db.query<any>("select kind,payload from booking_followups where event_key=$1",[args[0]])).rows;
    expect(jobs.find(j=>j.kind==='client_email').payload.pending).toBe(true);
    expect(jobs.find(j=>j.kind==='calendar')).toBeUndefined();
    await db.query('select commit_client_reschedule($1,$2,$3::uuid[],$4,$5,$6,$7)',args);
    expect((await db.query('select * from client_reschedule_requests')).rows).toHaveLength(1);
    await expect(db.query('select commit_client_reschedule($1,$2,$3::uuid[],$4,$5,$6,$7)',['99999999-9999-4999-8999-999999999999',id,[client],next,payload.scheduled_at,photographer,60])).rejects.toThrow('assignment_not_confirmed');
  });
  it('rolls back the entire hours replacement if one row is invalid',async()=>{
    const before=(await db.query('select * from team_availability')).rows;
    await expect(db.query('select replace_photographer_hours($1,$2::jsonb)',[photographer,JSON.stringify([{day_of_week:1,start_local:'bad',end_local:'17:00',timezone:'America/New_York'}])])).rejects.toThrow();
    expect((await db.query('select * from team_availability')).rows).toEqual(before);
    await db.query('select replace_photographer_hours($1,$2::jsonb)',[photographer,'[]']);
    expect((await db.query('select * from team_availability')).rows).toHaveLength(0);
  });
});


describe('automatic confirmation policy',()=>{
  it('confirms contractor bookings without fabricating a personal acceptance',async()=>{
    await enableDispatch();await db.exec('update business_settings set auto_confirm_bookings=true');
    const id=(await book()).rows[0].id;
    expect((await db.query('select assignment_state,assignment_confirmation_mode,assignment_due_at,contractor_response from orders')).rows[0]).toEqual({assignment_state:'confirmed',assignment_confirmation_mode:'automatic',assignment_due_at:null,contractor_response:null});
    const jobs=(await db.query<any>('select kind,payload from booking_followups')).rows;
    expect(jobs.find(j=>j.kind==='client_email').payload.event).not.toBe('assignment_pending');
    expect(jobs.find(j=>j.kind==='assignment_email').payload.automatically_confirmed).toBe(true);
    expect((await db.query<any>('select advance_photographer_assignment($1,1,$2) as ok',[id,backup])).rows[0].ok).toBe(false);
    await db.exec('update business_settings set auto_confirm_bookings=false');
    await book(); // replay retains the original confirmed booking
    expect((await db.query<any>('select assignment_state from orders')).rows[0].assignment_state).toBe('confirmed');
    await db.query("update orders set contractor_response='declined' where id=$1",[id]);
    expect((await db.query<any>('select assignment_state from orders')).rows[0].assignment_state).toBe('rerouting');
  });
  it('leaves pending requests and their deadlines intact when switched on',async()=>{
    await enableDispatch();const id=(await book()).rows[0].id;
    const before=(await db.query('select * from orders')).rows;
    const jobs=(await db.query('select * from booking_followups')).rows;
    await db.exec('update business_settings set auto_confirm_bookings=true');
    expect((await db.query('select * from orders')).rows).toEqual(before);
    expect((await db.query('select * from booking_followups')).rows).toEqual(jobs);
    await db.query("update orders set contractor_response='accepted' where id=$1",[id]);
    expect((await db.query<any>('select assignment_state,assignment_confirmation_mode from orders')).rows[0]).toEqual({assignment_state:'confirmed',assignment_confirmation_mode:'manual'});
  });
  it('requires internal photographer acceptance when off and checks ownership, version and deadline',async()=>{
    await enableDispatch();const id=(await book({...payload,photographer_id:backup})).rows[0].id;
    expect((await db.query<any>('select assignment_state from orders')).rows[0].assignment_state).toBe('awaiting_response');
    expect((await db.query<any>("select recipient from booking_followups where kind='assignment_email'")).rows[0].recipient).toBe('backup@example.test');
    const respond=(round:number,member:string,response='accepted')=>db.query<any>('select respond_to_team_assignment($1,$2,$3,$4) as ok',[id,round,member,response]);
    expect((await respond(1,photographer)).rows[0].ok).toBe(false);
    expect((await respond(2,backup)).rows[0].ok).toBe(false);
    expect((await respond(1,backup)).rows[0].ok).toBe(true);
    expect((await respond(1,backup)).rows[0].ok).toBe(false);
    expect((await db.query("select * from booking_followups where payload->>'event'='assignment_confirmed'")).rows).toHaveLength(1);
    expect((await respond(1,backup,'declined')).rows[0].ok).toBe(true);
    expect((await respond(1,backup)).rows[0].ok).toBe(false);
  });
  it('uses the saved policy for backups and reschedules, while retaining conflict checks',async()=>{
    await enableDispatch();const id=(await book()).rows[0].id;
    await db.exec('update business_settings set auto_confirm_bookings=true');
    await db.query("update orders set contractor_response='declined' where id=$1",[id]);
    await db.query('select advance_photographer_assignment($1,1,$2)',[id,backup]);
    expect((await db.query<any>('select assignment_state,assignment_confirmation_mode from orders')).rows[0]).toEqual({assignment_state:'confirmed',assignment_confirmation_mode:'automatic'});
    await db.exec('update business_settings set auto_confirm_bookings=false');
    await db.query("update orders set scheduled_at=scheduled_at+interval '1 day' where id=$1",[id]);
    expect((await db.query<any>('select assignment_state,assignment_confirmation_mode,assignment_round from orders')).rows[0]).toEqual({assignment_state:'awaiting_response',assignment_confirmation_mode:'manual',assignment_round:3});
    await db.query("update orders set assignment_due_at=now()-interval '1 minute' where id=$1",[id]);
    expect((await db.query<any>("select respond_to_team_assignment($1,3,$2,'accepted') as ok",[id,backup])).rows[0].ok).toBe(false);
    const rights=(await db.query<any>("select has_function_privilege('authenticated','respond_to_team_assignment(uuid,integer,uuid,text)','EXECUTE') as authenticated, has_function_privilege('anon','respond_to_team_assignment(uuid,integer,uuid,text)','EXECUTE') as anon")).rows[0];
    expect(rights).toEqual({authenticated:false,anon:false});
  });
});

describe('photography and video crew',()=>{
  async function crewReady() {
    await enableDispatch();
    await db.exec(`update photographer_routing set capture_skills=array['photography','videography','tour_360','drone','floor_plan'] where team_member_id='${backup}'`);
  }
  async function setCrew(id:string,photo=photographer,video:string|null=backup,override=false,expected?:string|null) {
    const stamp=(await db.query<{at:string|null}>('select updated_at::text as at from orders where id=$1',[id])).rows[0].at;
    return db.query('select set_order_crew($1,$2,$3,$4,$5,$6)',[id,photo,photo===photographer?contractor:null,video,expected===undefined?stamp:expected,override]);
  }
  it('assigns Karen-style photo/360 and a separate video member atomically, queuing one calendar update',async()=>{
    await crewReady(); const id=(await book({...payload,photographer_id:backup})).rows[0].id;
    await db.exec('delete from booking_followups');
    await setCrew(id);await setCrew(id);
    const row=(await db.query('select photographer_id,videographer_id,contractor_id,auto_dispatch,assignment_state from orders where id=$1',[id])).rows[0];
    expect(row).toEqual({photographer_id:photographer,videographer_id:backup,contractor_id:contractor,auto_dispatch:false,assignment_state:'awaiting_response'});
    expect((await db.query("select kind from booking_followups where kind='calendar'")).rows).toHaveLength(1);
    expect((await db.query("select kind from booking_followups where kind='assignment_email'")).rows).toHaveLength(1);
  });
  it('supports the same qualified person in both roles without a self-conflict',async()=>{
    await crewReady();const id=(await book({...payload,photographer_id:backup})).rows[0].id;
    await setCrew(id,backup,backup);
    expect((await db.query<{same:boolean}>('select photographer_id=videographer_id as same from orders where id=$1',[id])).rows[0].same).toBe(true);
  });
  it('rejects an unqualified video assignment even when travel conflicts are overridden',async()=>{
    await crewReady();const id=(await book()).rows[0].id;
    await expect(setCrew(id,photographer,photographer,true)).rejects.toThrow('videographer_not_qualified');
    expect((await db.query<{videographer_id:string|null}>('select videographer_id from orders where id=$1',[id])).rows[0].videographer_id).toBe(null);
  });
  it('prevents a video crew member from being double booked as a photographer',async()=>{
    await crewReady();const id=(await book()).rows[0].id;await setCrew(id);
    await expect(db.query("insert into orders(id,photographer_id,status,scheduled_at,duration_minutes) values(gen_random_uuid(),$1,'booked',$2,60)",[backup,payload.scheduled_at])).rejects.toThrow('slot_unavailable');
    const later=new Date(Date.parse(String(payload.scheduled_at))+3*3600000).toISOString();
    await db.query("insert into orders(id,photographer_id,status,scheduled_at,duration_minutes) values(gen_random_uuid(),$1,'booked',$2,60)",[backup,later]);
    await expect(db.query('select set_order_schedule_window($1,$2,$3,$4,60,false)',[id,later,new Date(Date.parse(later)+3600000).toISOString(),payload.scheduled_at])).rejects.toThrow('slot_unavailable');
  });
  it('protects stale crew edits and prevents client callers from assigning crew',async()=>{
    await crewReady();const id=(await book()).rows[0].id;
    await expect(setCrew(id,photographer,backup,false,'2020-01-01T00:00:00Z')).rejects.toThrow('order_changed');
    await db.exec('create or replace function is_team_member() returns boolean language sql as $$select false$$');
    await expect(setCrew(id)).rejects.toThrow('forbidden');
  });
  it('blocks video online booking for photo-only staff even when all products are enabled',async()=>{
    await crewReady();await db.exec(`update products set kind='video',name='Cinematic Videography'; update photographer_routing set product_ids=null`);
    await expect(book()).rejects.toThrow('capture skills');
    const id=(await book({...payload,photographer_id:backup})).rows[0].id;
    expect((await db.query<{videographer_id:string|null}>('select videographer_id from orders where id=$1',[id])).rows[0].videographer_id).toBe(backup);
    expect((await db.query("select id from booking_followups where order_id=$1 and kind='calendar'",[id])).rows).toHaveLength(1);
    await db.query('update orders set videographer_id=null where id=$1',[id]);
    await book({...payload,photographer_id:backup});
    expect((await db.query<{videographer_id:string|null}>('select videographer_id from orders where id=$1',[id])).rows[0].videographer_id).toBe(null);
  });
  it('requires the office to coordinate client rescheduling for a split crew',async()=>{
    await crewReady();const id=(await book()).rows[0].id;await setCrew(id);
    await expect(db.query('select commit_client_reschedule($1,$2,$3::uuid[],$4,$5,$6,60)',[requestId,id,[],payload.scheduled_at,new Date(Date.parse(String(payload.scheduled_at))+86400000).toISOString(),photographer])).rejects.toThrow('order_not_found');
    const cl=(await db.query<{client_id:string}>('select client_id from orders where id=$1',[id])).rows[0].client_id;
    await expect(db.query('select commit_client_reschedule($1,$2,$3::uuid[],$4,$5,$6,60)',[requestId,id,[cl],payload.scheduled_at,new Date(Date.parse(String(payload.scheduled_at))+86400000).toISOString(),photographer])).rejects.toThrow('crew_reschedule_requires_office');
  });
  it('keeps client and database skill classification consistent for real catalogue variants',async()=>{
    for(const p of [{name:'Interior/Exterior Photography',kind:'photo'},{name:'Drone Photos + Video',kind:'photo'},{name:'Virtual Twilight',kind:'addon'},{name:'Floor Plan',kind:'floor_plan'},{name:'3D Home + Floor Plan',kind:'addon'},{name:'Cinematic Videography',kind:'video'},{name:'Same-Day Delivery',kind:'addon'}]) {
      expect((await db.query<{skills:string[]}>('select product_capture_skills($1,$2) as skills',[p.kind,p.name])).rows[0].skills).toEqual(productCaptureSkills(p));
    }
  });
});

describe('individual crew visits and manual request recovery',()=>{
 async function setup(){
   await enableDispatch();
   await db.exec(`update photographer_routing set capture_skills=array['photography','videography'] where team_member_id='${backup}'; update products set duration_minutes=120`);
   return (await book({...payload,duration_minutes:120})).rows[0].id;
 }
 async function split(id:string,override=false,photoDuration=60,videoOffset=60,videoDuration=60){
   const stamp=(await db.query<{at:string}>('select updated_at::text as at from orders where id=$1',[id])).rows[0].at;
   return db.query('select set_order_crew($1,$2,$3,$4,$5,$6,0,$7,$8,$9)',[id,photographer,contractor,backup,stamp,override,photoDuration,videoOffset,videoDuration]);
 }
 it('stores two one-hour visits, leaves the client window intact, and queues one new request on retry',async()=>{
   const id=await setup();await db.exec('delete from booking_followups');await split(id);await split(id);
   const row=(await db.query<any>('select *,extract(epoch from assignment_due_at-now())/60 as deadline from orders where id=$1',[id])).rows[0];
   expect(row.duration_minutes).toBe(120);expect(row.photographer_duration_minutes).toBe(60);expect(row.videographer_start_offset_minutes).toBe(60);expect(row.videographer_duration_minutes).toBe(60);
   expect(Number(row.deadline)).toBeGreaterThan(1439);expect(row.auto_dispatch).toBe(false);expect(row.assignment_state).toBe('awaiting_response');expect(row.assignment_round).toBe(2);
   expect((await db.query("select kind from booking_followups where kind in ('assignment_email','assignment_sms','calendar') order by kind")).rows).toEqual([{kind:'assignment_email'},{kind:'assignment_sms'},{kind:'calendar'}]);
 });
 it('blocks each person only during their actual visit plus travel time',async()=>{
   const id=await setup();await split(id);
   const at=(minutes:number)=>new Date(Date.parse(String(payload.scheduled_at))+minutes*60000).toISOString();
   const add=(person:string,minutes:number)=>db.query("insert into orders(id,status,photographer_id,scheduled_at,duration_minutes) values(gen_random_uuid(),'scheduled',$1,$2,30)",[person,at(minutes)]);
   await add(backup,0); // Ends at 10:30; video begins at 11:00.
   await add(photographer,90); // Photo ends at 11:00; next appointment 11:30.
   await expect(add(photographer,0)).rejects.toThrow('slot_unavailable');
   await expect(add(backup,75)).rejects.toThrow('slot_unavailable');
 });
 it('permits a photo visit inside saved hours even when video and the client window run later',async()=>{
   const id=await setup();await split(id);
   await db.exec(`update team_availability set end_local='11:00' where team_member_id='${photographer}'`);
   await expect(split(id,false,90,90,30)).rejects.toThrow('working hours');
   await split(id,false,60,75,45);
   await expect(split(id,true,60,90,60)).rejects.toThrow('crew_windows_inside_appointment');
 });
 it('does not invalidate photography acceptance when only the video visit changes',async()=>{
   const id=await setup();await split(id);await db.query("update orders set contractor_response='accepted' where id=$1",[id]);await db.exec('delete from booking_followups');
   await split(id,false,60,75,45);
   expect((await db.query<any>('select assignment_round,contractor_response from orders where id=$1',[id])).rows[0]).toEqual({assignment_round:2,contractor_response:'accepted'});
   expect((await db.query('select kind from booking_followups')).rows).toEqual([{kind:'calendar'}]);
 });
 it('accepts a late unanswered office assignment without accepting a different assignment version',async()=>{
   const id=await setup();await split(id);
   await db.query("update orders set assignment_state='needs_attention',assignment_due_at=null where id=$1",[id]);
   await db.query("update orders set contractor_response='accepted' where id=$1 and assignment_round=1",[id]);
   expect((await db.query<any>('select contractor_response from orders where id=$1',[id])).rows[0].contractor_response).toBe(null);
   await db.query("update orders set contractor_response='accepted' where id=$1 and assignment_round=2",[id]);
   expect((await db.query<any>('select assignment_state from orders where id=$1',[id])).rows[0].assignment_state).toBe('confirmed');
 });
 it('renews overdue office requests once, rejects stale edits, and requires staff authorization',async()=>{
   const id=await setup();await split(id);await db.query("update orders set assignment_state='needs_attention',assignment_due_at=null where id=$1",[id]);await db.exec('delete from booking_followups');
   const stamp=(await db.query<{at:string}>('select updated_at::text as at from orders where id=$1',[id])).rows[0].at;
   const renew=(expected=stamp)=>db.query('select renew_order_assignment($1,2,$2,$3)',[id,expected,'Please confirm availability']);
   await expect(renew('2020-01-01T00:00:00Z')).rejects.toThrow('order_changed');
   await renew();await renew();
   expect((await db.query("select kind from booking_followups where kind='assignment_email'")).rows).toHaveLength(1);
   expect((await db.query<any>("select payload->>'availability_note' as note from booking_followups where kind='assignment_email'")).rows[0].note).toBe('Please confirm availability');
   await db.exec('create or replace function is_team_member() returns boolean language sql as $$select false$$');
   await expect(renew()).rejects.toThrow('forbidden');
 });
 it('keeps automatic dispatch on its shorter response deadline',async()=>{
   await setup();const row=(await db.query<any>('select extract(epoch from assignment_due_at-now())/60 as deadline from orders')).rows[0];
   expect(Number(row.deadline)).toBeLessThanOrEqual(60);expect(Number(row.deadline)).toBeGreaterThan(59);
 });
});
