import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table ai_jobs(id int primary key,status text,started_at timestamptz,completed_at timestamptz,error_message text,attempts int default 0,params jsonb);
    create table oceano_enhance_settings(id boolean primary key);`);
  await db.exec(readFileSync('supabase/migrations/20260921180000_generative_finish_defaults.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260921180100_enhancement_paid_attempts.sql','utf8'));
},30000);
afterAll(async () => db?.close());
beforeEach(async () => db.exec(`reset role; truncate ai_jobs;`));
it('never requeues an interrupted paid request; retries a pre-request failure', async () => {
  await db.exec(`insert into ai_jobs(id,status,started_at,params) values
    (1,'running',now()-interval '20 minutes','{"paid_request_started":true}'),
    (2,'running',now()-interval '20 minutes','{}'),
    (3,'running',now(),'{"paid_request_started":true}');`);
  expect((await db.query('select * from reap_stale_ai_jobs()')).rows).toEqual([{requeued:1,failed:1}]);
  expect((await db.query('select id,status from ai_jobs order by id')).rows).toEqual([{id:1,status:'failed'},{id:2,status:'pending'},{id:3,status:'running'}]);
});
it('prevents staff and anonymous sessions from invoking the reaper', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await expect(db.query('select * from reap_stale_ai_jobs()')).rejects.toThrow('permission denied');
    await db.exec('reset role');
  }
});
it('adds valid bright defaults without overwriting any old row', async () => {
  await db.exec('insert into oceano_enhance_settings(id) values(true)');
  const row = (await db.query<{finish_defaults:any}>('select finish_defaults from oceano_enhance_settings')).rows[0];
  expect(row.finish_defaults.interior).toMatchObject({style:'bright_listing',windows:'strong'});
  expect(row.finish_defaults.exterior.scene).toBe('exterior');
});
