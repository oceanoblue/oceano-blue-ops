import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
let db: PGlite;
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222",
  field = "33333333-3333-4333-8333-333333333333";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table team_members(id uuid primary key,is_active boolean,role text);
 create function public.is_team_member() returns boolean language sql stable security definer as $$select exists(select 1 from team_members where id=auth.uid() and is_active and role <> 'photographer')$$;
 insert into team_members values('${alice}',true,'admin'),('${bob}',true,'editor'),('${field}',true,'photographer');`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20260924085744_daily_operations_agents.sql",
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => db?.close());
async function asUser(id: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`,
  );
}
it("seeds active office users only with free factual rules", async () => {
  const { rows } = await db.query<{ user_id: string; agents: any }>(
    "select * from ops_agent_settings order by user_id",
  );
  expect(rows.map((r) => r.user_id)).toEqual([alice, bob]);
  expect(rows[0].agents.planner.provider).toBe("rules");
});
it("keeps calendar snapshots private and denies anonymous reads", async () => {
  await db.exec(
    `insert into ops_brief_runs(user_id,local_date,run_key,snapshot) values('${alice}','2026-09-24','daily','{"private":"calendar"}'),('${bob}','2026-09-24','daily','{}')`,
  );
  await asUser(alice);
  expect((await db.query("select user_id from ops_brief_runs")).rows).toEqual([
    { user_id: alice },
  ]);
  await db.exec("reset role;set role anon");
  await expect(db.query("select * from ops_brief_runs")).rejects.toThrow(
    "permission denied",
  );
  await db.exec("reset role");
});
it("prevents staff from writing run history and changing another user’s settings", async () => {
  await asUser(alice);
  await expect(
    db.query(
      `insert into ops_brief_runs(user_id,local_date,run_key) values('${alice}','2026-09-25','daily')`,
    ),
  ).rejects.toThrow("permission denied");
  expect(
    (
      await db.query(
        `update ops_agent_settings set enabled=false where user_id='${bob}' returning user_id`,
      )
    ).rows,
  ).toEqual([]);
  await expect(
    db.query(
      `update ops_agent_settings set user_id='${field}' where user_id='${alice}'`,
    ),
  ).rejects.toThrow("row-level security");
  await db.exec("reset role");
});
it("allows own schedule updates, denies field staff", async () => {
  await asUser(alice);
  expect(
    (
      await db.query(
        `update ops_agent_settings set brief_time='08:15' where user_id='${alice}' returning brief_time`,
      )
    ).rows,
  ).toEqual([{ brief_time: "08:15" }]);
  await asUser(field);
  await expect(
    db.query(`insert into ops_agent_settings(user_id) values('${field}')`),
  ).rejects.toThrow("row-level security");
  await db.exec("reset role");
});
it("claims each daily or manual slot exactly once, without blocking the next day", async () => {
  await db.exec("set role service_role");
  await expect(
    db.query(
      `insert into ops_brief_runs(user_id,local_date,run_key) values('${alice}','2026-09-24','daily')`,
    ),
  ).rejects.toThrow("duplicate key");
  await db.exec(
    `insert into ops_brief_runs(user_id,local_date,run_key) values('${alice}','2026-09-25','daily'),('${alice}','2026-09-24','manual:1')`,
  );
  await expect(
    db.query(
      `insert into ops_brief_runs(user_id,local_date,run_key) values('${alice}','2026-09-24','manual:1')`,
    ),
  ).rejects.toThrow("duplicate key");
  await db.exec("reset role");
});
