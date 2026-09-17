import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
let db: PGlite;
const id = '22222222-2222-4222-8222-222222222222';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table clients(id uuid primary key,full_name text);
    create table listings(id uuid primary key,address_line1 text);
    create table orders(id uuid primary key,order_number int,client_id uuid,listing_id uuid,
      download_paid_at timestamptz,download_paid_cents int,download_stripe_session_id text);
    grant select on orders,clients,listings to service_role;`);
  await db.exec(readFileSync('supabase/migrations/20260917132456_payment_owner_alerts.sql','utf8'));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`reset role; truncate payment_alerts,payment_alert_settings,orders cascade;
    insert into payment_alert_settings values('email','owner@example.test',true,now()-interval '1 hour'),('sms','+15555550100',true,now()-interval '1 hour');
    insert into orders values('${id}',70,null,null,now(),35000,'cs_live_fixture');`);
});
const claim = () => db.query('select * from claim_payment_alert()');
it('queues each channel once and claims distinct alerts under overlapping workers', async () => {
  await db.exec('set role service_role');
  const results = await Promise.all([claim(), claim(), claim()]);
  expect(results.map(r=>r.rows.length).sort()).toEqual([0,1,1]);
  expect(new Set(results.flatMap(r=>r.rows.map((v:any)=>v.id))).size).toBe(2);
  expect((await db.query('select count(*)::int n from payment_alerts')).rows).toEqual([{n:2}]);
});
it('ignores pending, test, zero-value and historical payments', async () => {
  for (const change of ["download_paid_at=null", "download_stripe_session_id='cs_test_fixture'", 'download_paid_cents=0', "download_paid_at=now()-interval '1 day'"]) {
    await db.exec(`update orders set download_paid_at=now(),download_paid_cents=35000,download_stripe_session_id='cs_live_fixture';update orders set ${change}`);
    expect((await claim()).rows).toHaveLength(0);
  }
});
it('does not requeue accepted, failed, or ambiguous provider attempts', async () => {
  await claim(); await claim();
  for (const state of ['accepted','failed','needs_review']) {
    await db.query('update payment_alerts set status=$1',[state]);
    expect((await claim()).rows).toHaveLength(0);
  }
});
it('keeps interrupted sends for review rather than resending', async () => {
  await claim(); await claim();
  await db.exec("update payment_alerts set claimed_at=now()-interval '6 minutes'");
  expect((await claim()).rows).toHaveLength(0);
  expect((await db.query('select distinct status from payment_alerts')).rows).toEqual([{status:'needs_review'}]);
});
it('disabling a channel stops its queued notifications', async () => {
  await claim(); await db.exec('update payment_alert_settings set enabled=false');
  expect((await claim()).rows).toHaveLength(0);
});
it('prevents public or authenticated clients from reading destinations or claiming alerts', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`reset role;set role ${role}`);
    await expect(claim()).rejects.toThrow('permission denied');
    await expect(db.query('select * from payment_alert_settings')).rejects.toThrow('permission denied');
    await expect(db.query('select * from payment_alerts')).rejects.toThrow('permission denied');
  }
});
