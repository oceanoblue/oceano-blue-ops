import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
let db: PGlite;
const order='00000000-0000-4000-8000-000000000001', photographer='00000000-0000-4000-8000-000000000002';
const start='2026-09-30T18:00:00Z';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create function is_team_member() returns boolean language sql as $$select current_setting('test.staff',true)='yes'$$;
    create table business_settings(id boolean,buffer_minutes int);
    insert into business_settings values(true,30);
    create table orders(id uuid primary key,photographer_id uuid,scheduled_at timestamptz,duration_minutes int,status text,updated_at timestamptz,total_cents int);
  `);
  await db.exec(readFileSync('supabase/migrations/0078_double_book_override.sql','utf8'));
  await db.exec('create trigger no_overlap before insert or update on orders for each row execute function check_order_no_double_book()');
  await db.exec(readFileSync('supabase/migrations/20260923002221_staff_appointment_window.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec(`reset role; set test.staff='yes'; set app.allow_double_book='off'; truncate orders;
    insert into orders values('${order}','${photographer}','${start}',210,'booked',now(),65000);`);
});
const save=(end: string | null='2026-09-30T19:30:00Z',override=false,previous=210)=>db.query('select set_order_schedule_window($1,$2,$3,$2,$4,$5)',[order,start,end,previous,override]);
it('saves the end time atomically without changing price and accepts retries',async()=>{
  await save(); await save();
  expect((await db.query('select duration_minutes,total_cents from orders')).rows).toEqual([{duration_minutes:90,total_cents:65000}]);
});
it('rejects a stale schedule rather than overwriting it',async()=>{
  await save(); await expect(save('2026-09-30T20:00:00Z')).rejects.toThrow('order_changed');
  expect((await db.query('select duration_minutes from orders')).rows).toEqual([{duration_minutes:90}]);
});
it('moves the start and end together and can schedule an unscheduled order',async()=>{
  await db.query('select set_order_schedule_window($1,$2,$3,$4,210,false)',[order,'2026-10-01T17:00:00Z','2026-10-01T18:00:00Z',start]);
  const moved=(await db.query<{scheduled_at:Date;duration_minutes:number}>('select scheduled_at,duration_minutes from orders')).rows[0];
  expect(moved.scheduled_at.toISOString()).toBe('2026-10-01T17:00:00.000Z');expect(moved.duration_minutes).toBe(60);
  await db.exec('update orders set scheduled_at=null');
  await db.query('select set_order_schedule_window($1,$2,$3,null,60,false)',[order,start,'2026-09-30T19:00:00Z']);
  expect((await db.query<{scheduled_at:Date}>('select scheduled_at from orders')).rows[0].scheduled_at.toISOString()).toBe('2026-09-30T18:00:00.000Z');
});
it('rejects missing, negative, short, fractional, and excessive windows in the database',async()=>{
  for (const end of [null,'2026-09-30T17:00:00Z','2026-09-30T18:05:00Z','2026-09-30T19:00:30Z','2026-10-01T08:00:00Z']) await expect(save(end)).rejects.toThrow('invalid_schedule_window');
});
it('blocks extending into another shoot and allows an explicit staff override',async()=>{
  await db.exec(`insert into orders values(gen_random_uuid(),'${photographer}','2026-09-30T22:30:00Z',60,'booked',now(),10000)`);
  await expect(save('2026-09-30T22:15:00Z')).rejects.toThrow('slot_unavailable');
  await save('2026-09-30T22:15:00Z',true);
  expect((await db.query('select duration_minutes from orders where id=$1',[order])).rows).toEqual([{duration_minutes:255}]);
  expect((await db.query("select current_setting('app.allow_double_book') as flag")).rows).toEqual([{flag:'off'}]);
});
it('denies client and anonymous callers, including overlap overrides',async()=>{
  await db.exec("set test.staff='no'; set role authenticated");
  await expect(save(undefined,true)).rejects.toThrow('forbidden');
  await db.exec('reset role; set role anon');
  await expect(save()).rejects.toThrow('permission denied');
});
