import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;
    create table team_members(id uuid primary key,role text,is_active boolean,full_name text);
    create function is_team_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from team_members where id=auth.uid() and role='admin' and is_active)$$;
    insert into team_members values('11111111-1111-4111-8111-111111111111','photographer',true,'Original');
    alter table team_members enable row level security;
    create policy "team_members admin update" on team_members for update using(id=auth.uid() or is_team_admin());
    create policy read_team on team_members for select using(true);
    grant usage on schema public,auth to authenticated; grant select,update on team_members to authenticated;`);
  await db.exec(readFileSync('supabase/migrations/20260908140303_protect_team_privileges.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
it('allows self profile edits but blocks role and activation changes through direct SQL', async () => {
  await db.exec('set role authenticated;');
  await db.exec("update team_members set full_name='Updated';");
  await expect(db.exec("update team_members set role='admin';")).rejects.toThrow('Only an active admin');
  await expect(db.exec('update team_members set is_active=false;')).rejects.toThrow('Only an active admin');
  expect((await db.query('select full_name,role,is_active from team_members')).rows).toEqual([{full_name:'Updated',role:'photographer',is_active:true}]);
  await db.exec('reset role;');
});
it('allows an existing active admin to manage team privileges', async () => {
  await db.exec("update team_members set role='admin'; set role authenticated;");
  await db.exec("update team_members set role='photographer';");
  expect((await db.query('select role from team_members')).rows).toEqual([{role:'photographer'}]);
  await db.exec('reset role;');
});
