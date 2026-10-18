import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from 'vitest';

let db: PGlite;
const photo = randomUUID(), video = randomUUID(), contractor = randomUUID(), order = randomUUID();
const previous = '2026-11-04T15:00:00Z', target = '2026-11-05T15:00:00Z';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;
    create function is_team_member() returns boolean language sql as $$select current_setting('test.staff',true)='yes'$$;
    create table team_members(id uuid primary key,is_active boolean);
    create table photographer_routing(team_member_id uuid,capture_skills text[]);
    create table contractors(id uuid primary key,team_member_id uuid);
    create table business_settings(id boolean primary key,buffer_minutes integer);
    create table orders(id uuid primary key default gen_random_uuid(),photographer_id uuid,videographer_id uuid,contractor_id uuid,scheduled_at timestamptz,duration_minutes integer,photographer_start_offset_minutes integer default 0,photographer_duration_minutes integer,videographer_start_offset_minutes integer default 0,videographer_duration_minutes integer,status text,updated_at timestamptz,total_cents integer);
    create table schedule_blocks(id uuid primary key default gen_random_uuid(),team_member_id uuid,starts_at timestamptz,ends_at timestamptz,is_available boolean,reason text);
    insert into team_members values('${photo}',true),('${video}',true);
    insert into photographer_routing values('${photo}',array['photography']),('${video}',array['photography','videography']);
    insert into contractors values('${contractor}','${video}');
    insert into business_settings values(true,30);`);
  const crew = readFileSync('supabase/migrations/20260923104656_manual_assignment_review.sql', 'utf8').match(/create function public\.crew_windows\([\s\S]*?\$\$;/i)?.[0];
  if (!crew) throw new Error('Production crew window function is missing');
  await db.exec(crew);
  await db.exec(readFileSync('supabase/migrations/20261008112200_allow_delivery_status_without_rescheduling.sql', 'utf8'));
  await db.exec('create trigger no_overlap before insert or update on orders for each row execute function check_order_no_double_book()');
  await db.exec(readFileSync('supabase/migrations/20260923002221_staff_appointment_window.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261018185935_crm_order_schedule_hold_guard.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("begin;set local test.staff='yes';set local app.allow_double_book='off'");
  await db.query("insert into orders(id,photographer_id,scheduled_at,duration_minutes,status,updated_at,total_cents) values($1,$2,$3,60,'scheduled',now(),65000)", [order, photo, previous]);
});
afterEach(async () => { await db.exec('rollback'); });
const block = (member = photo, start = '2026-11-05T14:30:00Z', end = '2026-11-05T16:30:00Z', reason = 'crm-session:fixture', available = false) => db.query('insert into schedule_blocks(team_member_id,starts_at,ends_at,is_available,reason) values($1,$2,$3,$4,$5)', [member, start, end, available, reason]);
const move = (at = target, override = false) => db.query('select set_order_schedule_window($1,$2,$2::timestamptz+interval \'1 hour\',$3,60,$4)', [order, at, previous, override]);
async function rejected(run: () => Promise<unknown>, expected = 'slot_unavailable') {
  await db.exec('savepoint expected_failure');
  try { await expect(run()).rejects.toThrow(expected); } finally { await db.exec('rollback to savepoint expected_failure'); }
}
it('rejects a staff reschedule into a CRM reservation and leaves shoot, price and hold intact', async () => {
  await block();
  await rejected(() => move());
  const { rows } = await db.query<any>('select scheduled_at,total_cents from orders where id=$1', [order]);
  expect(new Date(rows[0].scheduled_at).toISOString()).toBe(new Date(previous).toISOString());
  expect(rows[0].total_cents).toBe(65000);
  expect((await db.query('select is_available from schedule_blocks')).rows).toEqual([{ is_available: false }]);
});
it('retains the explicit staff override and permits status-only production completion afterwards', async () => {
  await block(); await move(target, true);
  expect((await db.query("select current_setting('app.allow_double_book') flag")).rows).toEqual([{ flag: 'off' }]);
  await db.query("update orders set status='delivered' where id=$1", [order]);
  expect((await db.query('select status,total_cents from orders where id=$1', [order])).rows).toEqual([{ status: 'delivered', total_cents: 65000 }]);
  await db.query('update orders set total_cents=66000 where id=$1', [order]);
  expect((await db.query('select total_cents from orders where id=$1', [order])).rows).toEqual([{ total_cents: 66000 }]);
  expect((await db.query('select count(*)::int n from schedule_blocks')).rows).toEqual([{ n: 1 }]);
});
it('protects each actual photo/video visit and resolves a contractor-only assignment', async () => {
  await block(video);
  await rejected(() => db.query("insert into orders(photographer_id,videographer_id,scheduled_at,duration_minutes,status) values($1,$2,$3,60,'scheduled')", [photo, video, target]));
  await rejected(() => db.query("insert into orders(contractor_id,scheduled_at,duration_minutes,status) values($1,$2,60,'scheduled')", [contractor, target]));
  await db.exec('delete from schedule_blocks');
  await block(video, '2026-11-05T15:00:00Z', '2026-11-05T15:30:00Z');
  await db.query("insert into orders(photographer_id,videographer_id,scheduled_at,duration_minutes,photographer_duration_minutes,videographer_start_offset_minutes,videographer_duration_minutes,status) values($1,$2,$3,120,60,60,60,'scheduled')", [photo, video, target]);
  expect((await db.query('select count(*)::int n from orders')).rows).toEqual([{ n: 2 }]);
});
it('enforces the real estate travel buffer and allows its exact boundary', async () => {
  await block();
  await rejected(() => move('2026-11-05T16:45:00Z'));
  await move('2026-11-05T17:00:00Z');
});
it('ignores released CRM reservations, other staff reservations and stale sync copies', async () => {
  await block(photo, undefined, undefined, 'crm-session:cancelled', true);
  await block(video);
  await block(photo, undefined, undefined, 'sync:stale-google-copy');
  await move();
});
it.each(['draft', 'cancelled'])('permits a %s record but validates reactivation against CRM reservations', async status => {
  await block();
  const id = randomUUID();
  await db.query('insert into orders(id,photographer_id,scheduled_at,duration_minutes,status) values($1,$2,$3,60,$4)', [id, photo, target, status]);
  await rejected(() => db.query("update orders set status='scheduled' where id=$1", [id]));
});
it('does not widen caller privileges or allow a client to request the staff override', async () => {
  await db.exec("set local test.staff='no';set local role authenticated");
  await rejected(() => move(target, true), 'forbidden');
  await db.exec('reset role;set local role anon');
  await rejected(() => move(target, true), 'permission denied');
  await db.exec('reset role');
  expect((await db.query("select prosecdef as elevated,has_function_privilege('anon','check_order_crm_session_reservations()','execute') as anon_execute from pg_proc where oid='check_order_crm_session_reservations()'::regprocedure")).rows).toEqual([{ elevated: false, anon_execute: false }]);
});
