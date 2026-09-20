import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create function is_team_member() returns boolean language sql as $$select current_setting('test.staff',true)='yes'$$;
    create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;
    create table orders(id uuid primary key);create table photos(id uuid primary key);create table delivery_links(id uuid primary key);`);
  await db.exec(readFileSync('supabase/migrations/20260920225452_gallery_revision_requests.sql','utf8'));
  await db.exec(`insert into orders values('00000000-0000-4000-8000-000000000001');insert into photos select id from orders;insert into delivery_links select id from orders;
    insert into gallery_revision_requests(id,order_id,photo_id,delivery_link_id,note) select id,id,id,id,'Please brighten' from orders;`);
},30000);
afterAll(async()=>{await db?.close();});
it('clients cannot list or directly submit revisions; staff can update status but cannot move requests',async()=>{
  await db.exec('set role anon');await expect(db.query('select * from gallery_revision_requests')).rejects.toThrow('permission denied');
  await db.exec("reset role;set role authenticated;set test.staff='no'");expect((await db.query('select * from gallery_revision_requests')).rows).toHaveLength(0);
  await expect(db.exec("insert into gallery_revision_requests(note) values('bad')")).rejects.toThrow('permission denied');
  await db.exec("set test.staff='yes'");expect((await db.query('select * from gallery_revision_requests')).rows).toHaveLength(1);
  await db.exec("update gallery_revision_requests set status='resolved',staff_response='Updated'");
  expect((await db.query<{status:string}>('select status from gallery_revision_requests')).rows[0].status).toBe('resolved');
  await expect(db.exec("update gallery_revision_requests set order_id=null")).rejects.toThrow('permission denied');
  await expect(db.exec("update gallery_revision_requests set status='fake'")).rejects.toThrow('check constraint');
});
