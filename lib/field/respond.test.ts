import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), email: vi.fn(), sms: vi.fn(), calendar: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/email/resend', () => ({ sendEmail: mocks.email }));
vi.mock('@/lib/integrations/quo', () => ({ sendSms: mocks.sms }));
vi.mock('@/lib/google-calendar/sync-shoot', () => ({ syncShootCalendar: mocks.calendar }));
vi.mock('@/lib/observability/report', () => ({ captureError: vi.fn(), logEvent: vi.fn() }));
import { recordContractorResponse, afterContractorResponse } from './respond';

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create table orders(id text primary key, contractor_id text, assignment_round int,
    contractor_response text, contractor_responded_at timestamptz, contractor_response_note text,
    updated_at timestamptz, archived_at timestamptz, status text);
    create table assignment_events(order_id text, contractor_id text, event text, note text);`);
});
afterAll(() => db.close());

// Run the handler's actual UPDATE predicates in Postgres so concurrent/replayed
// requests exercise row-level conditional writes, not preselected mock results.
function query(table: string) {
  let values: Record<string, unknown> | undefined;
  let insert = false;
  const conditions: Array<[string, unknown?]> = [];
  const q = {
    update(v: Record<string, unknown>) { values = v; return q; },
    insert(v: Record<string, unknown>) { values = v; insert = true; return q; },
    select() { return q; },
    eq(k: string, v: unknown) { conditions.push([`${k} = ?`, v]); return q; },
    is(k: string, v: unknown) { expect(v).toBeNull(); conditions.push([`${k} is null`]); return q; },
    not(k: string, op: string, v: string) {
      expect([k, op, v]).toEqual(['status', 'in', '(cancelled,draft)']);
      conditions.push(["status not in ('cancelled','draft')"]); return q;
    },
    or(filter: string) {
      const answer = filter.match(/^contractor_response.is.null,contractor_response.neq.(accepted|declined)$/)?.[1];
      expect(answer).toBeTruthy();
      conditions.push(['(contractor_response is null or contractor_response <> ?)', answer]); return q;
    },
    async execute() {
      if (table === 'team_members') return { data: [
        { email: 'office@example.test', phone: '+15555550100' },
        { email: ' OFFICE@example.test ', phone: '+15555550100' },
      ], error: null };
      if (table === 'contractors') return { data: { full_name: 'Test photographer' }, error: null };
      const params: unknown[] = [];
      const bind = (v: unknown) => { params.push(v); return `$${params.length}`; };
      const fields = Object.entries(values || {});
      const write = fields.map(([k,v]) => `${k}=${bind(v)}`).join(',');
      const where = conditions.map(([sql,v]) => sql.includes('?') ? sql.replace('?', bind(v)) : sql).join(' and ');
      let sql = values ? `update ${table} set ${write} where ${where} returning *` : `select * from ${table} where ${where}`;
      if (insert) sql = `insert into ${table} (${fields.map(([k])=>k).join(',')}) values (${fields.map((_,i)=>`$${i+1}`).join(',')}) returning *`;
      const { rows } = await db.query(sql, params);
      return { data: rows.map((r:any)=>({...r, order_number:73, listings:{address_line1:'Test property'}})), error: null };
    },
    async maybeSingle() { const r = await q.execute(); return { ...r, data: Array.isArray(r.data) ? r.data[0] || null : r.data }; },
    then(resolve: (r:unknown)=>unknown, reject?: (e:unknown)=>unknown) { return q.execute().then(resolve,reject); },
  };
  return q;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.exec("delete from assignment_events; delete from orders; insert into orders(id,contractor_id,assignment_round,status) values('order','karen',1,'scheduled')");
  mocks.admin.mockReturnValue({ from: query });
  mocks.email.mockResolvedValue({status:'sent',id:'mail'});
});
const opts = {orderId:'order',contractorId:'karen',round:1,response:'accepted' as const};
async function respond(options = opts) {
  const result = await recordContractorResponse(options);
  await afterContractorResponse({orderId:options.orderId,response:options.response,result,source:'email',baseUrl:'https://example.test'});
  return result;
}

it('five concurrent acceptances produce one audit event, email and calendar sync', async () => {
  const results = await Promise.all(Array.from({length:5},()=>respond()));
  expect(results.filter(r=>r.ok && r.changed)).toHaveLength(1);
  expect(results.filter(r=>r.ok && !r.changed)).toHaveLength(4);
  expect((await db.query('select * from assignment_events')).rows).toHaveLength(1);
  expect(mocks.email).toHaveBeenCalledTimes(1);
  expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({to:'office@example.test',idempotencyKey:expect.stringContaining('contractor-response/order/1/accepted/')}));
  expect(mocks.calendar).toHaveBeenCalledTimes(1);
  expect(mocks.sms).toHaveBeenCalledTimes(1);
});
it('a later replay preserves the first response time and note without notifying', async () => {
  await recordContractorResponse({...opts,note:'Original note'});
  const before = (await db.query('select * from orders')).rows;
  expect(await respond()).toEqual({ok:true,changed:false});
  expect((await db.query('select * from orders')).rows).toEqual(before);
  expect(mocks.email).not.toHaveBeenCalled();
});
it('a stale assignment or wrong contractor never succeeds or notifies', async () => {
  expect((await respond({...opts,round:0})).ok).toBe(false);
  expect((await respond({...opts,contractorId:'other'})).ok).toBe(false);
  expect(mocks.email).not.toHaveBeenCalled();
});
it('calendar stale reads cannot overwrite an answer recorded through the app', async () => {
  await recordContractorResponse(opts);
  expect(await recordContractorResponse({...opts,response:'declined',onlyIfUnanswered:true})).toEqual({ok:false,reason:'not_your_assignment'});
  expect((await db.query('select contractor_response from orders')).rows).toEqual([{contractor_response:'accepted'}]);
});
it('a genuine changed response and a new assignment round can each notify again', async () => {
  await respond();
  const declined = await recordContractorResponse({...opts,response:'declined'});
  await afterContractorResponse({orderId:'order',response:'declined',result:declined,source:'portal',baseUrl:'https://example.test'});
  await db.exec('update orders set assignment_round=2,contractor_response=null');
  await respond({...opts,round:2});
  expect(mocks.email).toHaveBeenCalledTimes(3);
  expect(new Set(mocks.email.mock.calls.map(([mail])=>mail.idempotencyKey)).size).toBe(3);
});
