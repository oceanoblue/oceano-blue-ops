import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
let db: PGlite;
const client='00000000-0000-4000-8000-000000000001', photographer='00000000-0000-4000-8000-000000000002', order='00000000-0000-4000-8000-000000000003', request='00000000-0000-4000-8000-000000000004';
let previous: string, next: string;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`set timezone='UTC'; create role anon; create role authenticated; create role service_role bypassrls;
    create function is_team_member() returns boolean language sql as $$select current_setting('test.staff',true)='yes'$$;
    create table business_settings(id boolean primary key, buffer_minutes int default 30,min_notice_hours int default 4,max_notice_days int default 30,default_timezone text default 'UTC');
    insert into business_settings(id) values(true);
    create table clients(id uuid primary key,full_name text,email text,phone text);
    create table listings(id uuid primary key,address_line1 text,city text,state text,zip text);
    create table orders(id uuid primary key,client_id uuid,listing_id uuid,photographer_id uuid,status text,scheduled_at timestamptz,duration_minutes int,updated_at timestamptz);
    create table team_members(id uuid primary key,role text,is_active boolean,email text);
    create table team_availability(team_member_id uuid,day_of_week int,start_local time,end_local time,timezone text,is_active boolean);
    create table schedule_blocks(team_member_id uuid,starts_at timestamptz,ends_at timestamptz,is_available boolean);
    insert into clients values('${client}','Test client','client@example.test',null);
    insert into listings values('${client}','Test property','Test city','SC','00000');
    insert into team_members values('${photographer}','photographer',true,'photographer@example.test'),('${client}','admin',true,'office@example.test');
    insert into team_availability select '${photographer}',day,'09:00'::time,'17:00'::time,'UTC',true from generate_series(0,6) day;`);
  const booking=readFileSync('supabase/migrations/20260908140351_reliable_public_booking.sql','utf8');
  await db.exec(booking.slice(booking.indexOf('create table public.booking_followups'),booking.indexOf('create index booking_followups_pending_idx')));
  await db.exec(readFileSync('supabase/migrations/0078_double_book_override.sql','utf8'));
  await db.exec('create trigger no_double_book before insert or update on orders for each row execute function check_order_no_double_book()');
  await db.exec(readFileSync('supabase/migrations/20260920230259_client_rescheduling.sql','utf8'));
  await db.exec('grant select,insert,update on all tables in schema public to service_role');
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec(`reset role; delete from client_reschedule_requests; delete from booking_followups; delete from orders; delete from schedule_blocks;
    update business_settings set client_rescheduling_enabled=true,client_reschedule_cutoff_hours=48;
    insert into orders values('${order}','${client}','${client}','${photographer}','booked',date_trunc('day',now())+interval '7 days 10 hours',60,now());`);
  const row=(await db.query<{previous:Date;next:Date}>(`select scheduled_at as previous, scheduled_at+interval '1 day' as next from orders`)).rows[0];
  previous=new Date(row.previous).toISOString(); next=new Date(row.next).toISOString();
});
const commit=(overrides: Partial<{id:string;clients:string[];previous:string;next:string;duration:number}>={})=>db.query('select commit_client_reschedule($1,$2,$3::uuid[],$4,$5,$6,$7)',[overrides.id||request,order,overrides.clients||[client],overrides.previous||previous,overrides.next||next,photographer,overrides.duration??60]);
it('moves an owned booking atomically and deduplicates notifications after a lost response',async()=>{
  await db.exec('set role service_role'); await commit(); await commit();
  const result=await db.query<{kind:string;payload:any}>('select kind,payload from booking_followups order by kind');
  expect(result.rows.map(x=>x.kind)).toEqual(['calendar','client_email','office_email']);
  expect(result.rows.every(x=>x.payload.event==='rescheduled')).toBe(true);
  expect(new Date((await db.query<{scheduled_at:Date}>('select scheduled_at from orders')).rows[0].scheduled_at).toISOString()).toBe(next);
  expect((await db.query('select * from client_reschedule_requests')).rows).toHaveLength(1);
});
it('rejects another client and rejects reusing a request with changed content',async()=>{
  await expect(commit({clients:[photographer]})).rejects.toThrow('order_not_found');
  await commit(); await expect(commit({next:new Date(Date.parse(next)+3600000).toISOString()})).rejects.toThrow('request_changed');
});
it('enforces the cutoff and the organization switch in the database',async()=>{
  await db.exec('update business_settings set client_reschedule_cutoff_hours=720'); await expect(commit()).rejects.toThrow('cutoff_passed');
  await db.exec('update business_settings set client_rescheduling_enabled=false'); await expect(commit()).rejects.toThrow('rescheduling_disabled');
});
it('rejects stale appointment details and changed duration',async()=>{
  await expect(commit({previous:next})).rejects.toThrow('order_changed'); await expect(commit({duration:90})).rejects.toThrow('order_changed');
});
it('requires a scheduled booking and configured working hours',async()=>{
  await db.exec("update orders set status='shooting'"); await expect(commit()).rejects.toThrow('contact_office');
  await db.exec("update orders set status='booked'"); await expect(commit({next:next.replace('10:00','18:00')})).rejects.toThrow('slot_unavailable');
});
it('rejects schedule blocks without moving the original appointment or adding follow-ups',async()=>{
  await db.query(`insert into schedule_blocks values($1,$2::timestamptz-interval '90 minutes',$2::timestamptz-interval '10 minutes',false)`,[photographer,next]);
  await expect(commit()).rejects.toThrow('slot_unavailable');
  expect(new Date((await db.query<{scheduled_at:Date}>('select scheduled_at from orders')).rows[0].scheduled_at).toISOString()).toBe(previous);
  expect((await db.query('select * from booking_followups')).rows).toHaveLength(0);
});
it('uses the existing travel-buffer guard even if an override was set',async()=>{
  await db.query(`insert into orders values($1,$2,$2,$3,'booked',$4::timestamptz+interval '70 minutes',60,now())`,[request,client,photographer,next]);
  await db.exec("set app.allow_double_book='on'");
  await expect(commit()).rejects.toThrow('slot_unavailable');
  await db.exec("set app.allow_double_book='off'");
  expect((await db.query('select * from client_reschedule_requests')).rows).toHaveLength(0);
});
it('cannot be called directly by clients or anonymous visitors',async()=>{
  await db.exec('set role authenticated'); await expect(commit()).rejects.toThrow('permission denied');
  expect((await db.query('select * from client_reschedule_requests')).rows).toHaveLength(0);
  await expect(db.exec('insert into client_reschedule_requests default values')).rejects.toThrow('permission denied');
  await db.exec('set role anon'); await expect(commit()).rejects.toThrow('permission denied');
});
