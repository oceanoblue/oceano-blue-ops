import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("removes token access even from an admin session while preserving connection health and server access", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create table team_calendar_connections(id int,team_member_id int,provider text,account_email text,
        access_token text,refresh_token text,expires_at timestamptz,scope text,primary_calendar_id text,
        is_active boolean,last_synced_at timestamptz,created_at timestamptz,updated_at timestamptz);
      insert into team_calendar_connections(id,access_token,refresh_token,is_active) values(1,'secret-access','secret-refresh',true);
      grant all on team_calendar_connections to anon,authenticated;
      grant select(access_token,refresh_token) on team_calendar_connections to authenticated;
      alter table team_calendar_connections enable row level security;
      create policy "self read calendar connection" on team_calendar_connections for select using(true);
      create policy "self rw calendar connection" on team_calendar_connections for all using(true);`);
    await db.exec(readFileSync("supabase/migrations/20260924095719_protect_google_credentials.sql", "utf8"));
    await db.exec("set role authenticated");
    expect((await db.query("select id,is_active from team_calendar_connections")).rows).toEqual([{ id:1,is_active:true }]);
    for (const query of ["select access_token from team_calendar_connections", "select refresh_token from team_calendar_connections", "select * from team_calendar_connections", "update team_calendar_connections set is_active=false"]) {
      await expect(db.query(query)).rejects.toThrow("permission denied");
    }
    await db.exec("reset role;set role anon");
    await expect(db.query("select id from team_calendar_connections")).rejects.toThrow("permission denied");
    await db.exec("reset role;set role service_role");
    expect((await db.query("select access_token from team_calendar_connections")).rows).toHaveLength(1);
  } finally { await db.close(); }
}, 30000);
