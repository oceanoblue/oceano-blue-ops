import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
let db: PGlite;
const admin = '33333333-3333-4333-8333-333333333333', alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const ca = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cb = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const fields = { contractor_id: ca, title: 'Test production', event_type: 'Corporate', role: 'Videographer', location: 'Test venue', event_date: '2026-10-16', rate_cents: 7500, estimated_minutes: 240, instructions: '' };
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create table team_members(id uuid primary key,role text,is_active boolean);
    create table contractors(id uuid primary key,auth_user_id uuid,is_active boolean);
    create function current_contractor_id() returns uuid language sql stable security definer set search_path=public as $$ select id from contractors where auth_user_id=auth.uid() and is_active limit 1 $$;
    alter table team_members enable row level security; alter table contractors enable row level security;
    create policy own_team on team_members for select to authenticated using(id=auth.uid());
    create policy own_contractor on contractors for select to authenticated using(auth_user_id=auth.uid());
    grant select on team_members,contractors to authenticated,service_role;
    insert into team_members values('${admin}','admin',true),('${bob}','photographer',true);
    insert into contractors values('${ca}','${alice}',true),('${cb}','${bob}',true);
  `);
  await db.exec(readFileSync('supabase/migrations/20261016014522_contractor_hourly_work.sql', 'utf8'));
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });
async function act(action: string, id: string, version: number | null, data: Record<string, unknown> = {}, actor = admin) {
  return (await db.query<{ result: { id?: string; version?: number; error?: string } }>('select contractor_hourly_action($1,$2,$3,$4,$5::jsonb) result', [actor, action, id, version, JSON.stringify(data)])).rows[0].result;
}
async function create(overrides = {}) { const id = randomUUID(); expect(await act('create', id, null, { ...fields, ...overrides })).toEqual({ id, version: 1 }); return id; }
async function row(id: string) { return (await db.query<any>('select * from contractor_hourly_assignments where id=$1', [id])).rows[0]; }
async function approved() { const id = await create(); await act('submit', id, 1, { actual_minutes: 270, note: 'Extra coverage requested' }, alice); await act('approve', id, 2, { approved_minutes: 270 }); return id; }
async function asUser(id: string) { await db.query(`select set_config('request.jwt.claim.sub',$1,true)`, [id]); await db.exec('set local role authenticated'); }

describe('hourly work payment lifecycle', () => {
  it('starts with no seeded assignments or payments', async () => { expect((await db.query('select * from contractor_hourly_assignments')).rows).toHaveLength(0); });
  it('allows creation and transitions with the service role', async () => { await db.exec('set local role service_role'); const id = await approved(); expect(await act('pay', id, 3, { note: 'Zelle reference test' })).toEqual({ id, version: 4 }); });
  it('records actual and approved hours separately and uses exact cents', async () => { const id = await create(); await act('submit', id, 1, { actual_minutes: 270, note: 'Extra setup' }, alice); await act('approve', id, 2, { approved_minutes: 255, note: 'Break excluded by agreement' }); const a = await row(id); expect(a.actual_minutes).toBe(270); expect(a.approved_minutes).toBe(255); expect(a.amount_cents).toBe(31875); });
  it('calculates 4.5 hours at $75 as $337.50', async () => { expect((await row(await approved())).amount_cents).toBe(33750); });
  it('rounds fractional cents once at the final total', async () => { const id = await create({ rate_cents: 6001 }); await act('submit', id, 1, { actual_minutes: 1 }, alice); await act('approve', id, 2, { approved_minutes: 1 }); expect((await row(id)).amount_cents).toBe(100); });
  it('does not include assigned or submitted hours in balance owed', async () => { const id = await create(); await act('submit', id, 1, { actual_minutes: 240 }, alice); expect((await db.query<any>('select * from contractor_hourly_balances')).rows[0].owed_cents).toBe(0); });
  it('requires an explanation for additional time and adjusted approval', async () => { const id = await create(); expect(await act('submit', id, 1, { actual_minutes: 300 }, alice)).toEqual({ error: 'note_required' }); await act('submit', id, 1, { actual_minutes: 240 }, alice); expect(await act('approve', id, 2, { approved_minutes: 230 })).toEqual({ error: 'note_required' }); expect((await row(id)).version).toBe(2); });
  it('keeps another assignment’s rate independent', async () => { const id = await approved(); const other = await create(); await act('edit', other, 1, { ...fields, rate_cents: 10000 }); expect((await row(id)).rate_cents).toBe(7500); expect((await row(id)).amount_cents).toBe(33750); });
  it('locks the agreed rate after hours are submitted', async () => { const id = await approved(); expect(await act('edit', id, 3, { ...fields, rate_cents: 9000 })).toEqual({ error: 'invalid_state' }); });
  it('rejects stale edits and duplicate submission / payment', async () => { const id = await approved(); expect(await act('approve', id, 2, { approved_minutes: 100 })).toEqual({ error: 'changed' }); await act('pay', id, 3, { note: 'Bank transfer 1234' }); expect(await act('pay', id, 3, { note: 'Bank transfer 1234' })).toEqual({ error: 'changed' }); expect(await act('pay', id, 4, { note: 'Bank transfer 1234' })).toEqual({ error: 'invalid_state' }); expect((await db.query('select * from contractor_hourly_events')).rows).toHaveLength(4); });
  it('prevents duplicate creation with the same request ID', async () => { const id = await create(); expect(await act('create', id, null, fields)).toEqual({ error: 'duplicate' }); expect((await db.query('select * from contractor_hourly_events')).rows).toHaveLength(1); });
  it('never pays unapproved time', async () => { const id = await create(); expect(await act('pay', id, 1, { note: 'Cash' })).toEqual({ error: 'invalid_state' }); });
  it('requires payment reference and removes paid amounts from owed', async () => { const id = await approved(); expect(await act('pay', id, 3)).toEqual({ error: 'note_required' }); await act('pay', id, 3, { note: 'Zelle 1234' }); const b = (await db.query<any>('select * from contractor_hourly_balances')).rows[0]; expect(b.owed_cents).toBe(0); expect(b.unpaid_count).toBe(0); expect(b.total).toBe(1); expect((await row(id)).amount_cents).toBe(33750); });
  it('returning approval removes owed amount and requires resubmission', async () => { const id = await approved(); await act('return', id, 3, { note: 'Please correct break time' }); expect((await row(id)).status).toBe('assigned'); expect((await row(id)).amount_cents).toBe(null); expect((await db.query<any>('select * from contractor_hourly_balances')).rows[0].owed_cents).toBe(0); expect(await act('approve', id, 4, { approved_minutes: 240 })).toEqual({ error: 'invalid_state' }); });
  it('retains historical snapshots after a correction', async () => { const id = await approved(); await act('return', id, 3, { note: 'Correction needed' }); const events = (await db.query<any>("select details from contractor_hourly_events where kind='return'")).rows; expect(events[0].details.before.amount_cents).toBe(33750); expect(events[0].details.after.amount_cents).toBe(null); });
  it('cancellation removes the balance without deleting history', async () => { const id = await approved(); await act('cancel', id, 3, { note: 'Duplicate assignment' }); expect((await row(id)).status).toBe('cancelled'); expect((await db.query<any>('select * from contractor_hourly_balances')).rows[0].owed_cents).toBe(0); });
  it('rejects missing and invalid hours', async () => { const id = await create(); for (const minutes of [null, 0, -1, 1441]) expect(await act('submit', id, 1, { actual_minutes: minutes }, alice)).toEqual({ error: 'invalid_data' }); });
});

describe('hourly authorization and immutable history', () => {
  it('prevents contractors from creating, editing, approving or paying', async () => { const id = await create(); for (const action of ['create', 'edit', 'approve', 'pay', 'cancel', 'return']) expect(await act(action, id, 1, fields, alice)).toEqual({ error: 'forbidden' }); });
  it('does not let another contractor submit hours', async () => { const id = await create(); expect(await act('submit', id, 1, { actual_minutes: 240 }, bob)).toEqual({ error: 'forbidden' }); });
  it('rechecks deactivated contractors and administrators', async () => { const id = await create(); await db.exec(`update contractors set is_active=false where id='${ca}'`); expect(await act('submit', id, 1, { actual_minutes: 240 }, alice)).toEqual({ error: 'forbidden' }); await db.exec(`update team_members set is_active=false where id='${admin}'`); expect(await act('approve', id, 1, { approved_minutes: 240 })).toEqual({ error: 'forbidden' }); });
  it('scopes assignment, audit, and aggregate reads to the signed-in contractor', async () => { const own = await approved(); await create({ contractor_id: cb }); await asUser(alice); expect((await db.query('select id from contractor_hourly_assignments')).rows).toEqual([{ id: own }]); expect((await db.query('select distinct assignment_id from contractor_hourly_events')).rows).toEqual([{ assignment_id: own }]); expect((await db.query('select contractor_id from contractor_hourly_balances')).rows).toEqual([{ contractor_id: ca }]); });
  it('denies anonymous reads, browser writes, and direct RPC execution', async () => { const result = (await db.query<any>(`select has_table_privilege('anon','contractor_hourly_assignments','select') anon_read,has_table_privilege('authenticated','contractor_hourly_assignments','update') client_write,has_function_privilege('authenticated','contractor_hourly_action(uuid,text,uuid,integer,jsonb)','execute') client_rpc`)).rows[0]; expect(result).toEqual({ anon_read: false, client_write: false, client_rpc: false }); });
  it('blocks rewriting a paid record', async () => { const id = await approved(); await act('pay', id, 3, { note: 'Zelle 1234' }); await expect(db.query('update contractor_hourly_assignments set rate_cents=1 where id=$1', [id])).rejects.toThrow(/immutable/); });
  it('blocks audit deletion', async () => { await create(); await expect(db.exec('delete from contractor_hourly_events')).rejects.toThrow(/append-only/); });
  it('protects contractor history from cascade deletion', async () => { await create(); await expect(db.query('delete from contractors where id=$1', [ca])).rejects.toThrow(/foreign key/); });
});
