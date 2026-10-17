import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
let db: PGlite;
const admin = randomUUID(), coordinator = randomUUID(), contractor = randomUUID(), inactive = randomUUID(), project = randomUUID(), client = randomUUID();
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create table team_members(id uuid primary key,full_name text,role text,is_active boolean);
    alter table team_members enable row level security;create policy own_team on team_members for select to authenticated using(id=auth.uid());grant select on team_members to authenticated,service_role;
    create table projects(id uuid primary key);
    create table crm_opportunities(project_id uuid primary key,client_id uuid);
    create table crm_events(client_id uuid,project_id uuid,actor_id uuid,kind text,body text,details jsonb);
    create function crm_history_guard() returns trigger language plpgsql as $$begin raise exception 'CRM history is append-only';end$$;
    insert into team_members values('${admin}','Office Admin','admin',true),('${coordinator}','Office Coordinator','coordinator',true),('${contractor}','Contractor','photographer',true),('${inactive}','Inactive Admin','admin',false);
    insert into projects values('${project}');insert into crm_opportunities values('${project}','${client}');
  `);
  await db.exec(readFileSync("supabase/migrations/20261017114951_crm_migration_audit.sql", "utf8"));
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
const source = (patch: Record<string, unknown> = {}) => ({ source_system: "honeybook", source_kind: "project", source_id: randomUUID(), source_url: "https://app.honeybook.com/project/source", title: "Verified wedding source", observed_at: "2026-10-17T12:00:00Z", project_date: "2027-01-07", facts: { pipeline_stage: "Planning", balance_verified: false }, flags: ["due_date_unverified"], ...patch });
async function action(kind: string, id: string, data: unknown, version: number | null = null, actor = admin) {
  return (await db.query<any>("select crm_migration_action($1,$2,$3,$4,$5::jsonb) result", [actor, kind, id, version, JSON.stringify(data)])).rows[0].result;
}
async function importRows(records = [source()]) {
  const result = await action("import", randomUUID(), { records });
  expect(result).toMatchObject({ imported: records.length, skipped: 0 });
  return (await db.query<any>("select * from crm_migration_observations order by created_at,id")).rows;
}
async function page(patch: Record<string, unknown> = {}, actor = admin) {
  const args = { query: "", page: 0, year: null, status: "unresolved", kind: "all", ...patch };
  return (await db.query<any>("select crm_migration_page($1,$2,$3,$4,$5,$6) result", [actor, args.query, args.page, args.year, args.status, args.kind])).rows[0].result;
}
const review = (patch: Record<string, unknown> = {}) => ({ review_state: "active", priority: "urgent", next_action: "Confirm the payment schedule", owner_id: admin, follow_up_at: "2026-10-19T13:00:00Z", linked_ops_project: null, reason: "Checked the source project and scheduled office follow-up.", ...patch });
it("imports dated source observations without changing projects, reconciling payments or creating tasks", async () => {
  const [row] = await importRows();
  expect(row).toMatchObject({ review_state: "pending", priority: "normal", facts: { pipeline_stage: "Planning", balance_verified: false }, flags: ["due_date_unverified"], version: 1 });
  expect((await db.query("select * from projects")).rows).toEqual([{ id: project }]);
  expect((await db.query("select * from crm_events")).rows).toHaveLength(0);
});
it("skips duplicate source observations after review without replacing source facts or review decisions", async () => {
  const snapshot = source();
  const [row] = await importRows([snapshot]);
  await action("review", row.id, review(), 1);
  expect(await action("import", randomUUID(), { records: [{ ...snapshot, facts: { pipeline_stage: "Different" }, review_state: "history" }] })).toMatchObject({ imported: 0, skipped: 1 });
  const saved = (await db.query<any>("select * from crm_migration_observations")).rows[0];
  expect(saved).toMatchObject({ review_state: "active", priority: "urgent", next_action: "Confirm the payment schedule", facts: snapshot.facts, version: 2 });
});
it("keeps different source kinds distinct even when their source IDs match", async () => {
  const id = randomUUID();
  await importRows([source({ source_id: id }), source({ source_id: id, source_kind: "payment" })]);
  expect((await page()).counts.total).toBe(2);
});
it("uses optimistic review versions, records before/after evidence and adds linked CRM activity", async () => {
  const [row] = await importRows();
  expect(await action("review", row.id, review({ linked_ops_project: project }), 1)).toMatchObject({ version: 2 });
  expect(await action("review", row.id, review({ review_state: "history" }), 1)).toMatchObject({ error: expect.stringContaining("Record changed") });
  const history = (await db.query<any>("select * from crm_migration_reviews")).rows;
  expect(history).toHaveLength(1);
  expect(history[0].before_snapshot.review_state).toBe("pending");
  expect(history[0].after_snapshot).toMatchObject({ review_state: "active", linked_ops_project: project, version: 2 });
  expect((await db.query<any>("select * from crm_events")).rows[0]).toMatchObject({ client_id: client, project_id: project, kind: "migration_review" });
  expect((await page()).observations[0].reviews[0]).toMatchObject({ actor_name: "Office Admin", review_state: "active" });
});
it("preserves immutable source snapshots and append-only review history", async () => {
  const [row] = await importRows();
  await db.exec("savepoint immutable_check");
  await expect(db.query("update crm_migration_observations set facts='{}' where id=$1", [row.id])).rejects.toThrow("immutable");
  await db.exec("rollback to savepoint immutable_check");
  await action("review", row.id, review(), 1);
  await expect(db.query("update crm_migration_reviews set reason='Different'")).rejects.toThrow("append-only");
});
it("validates all office owners before inserting any row and requires a review reason", async () => {
  expect(await action("import", randomUUID(), { records: [source(), source({ owner_id: contractor })] })).toMatchObject({ error: expect.stringContaining("active office owner") });
  expect((await page()).counts.total).toBe(0);
  const [row] = await importRows();
  expect(await action("review", row.id, review({ reason: " " }), 1)).toHaveProperty("error");
  expect(await action("review", row.id, review({ owner_id: inactive }), 1)).toHaveProperty("error");
});
it("filters and paginates on the server while reporting global counts across every page", async () => {
  const records = Array.from({ length: 123 }, (_, i) => source({ title: `Source wedding ${i}`, project_date: i < 82 ? "2026-11-01" : "2027-03-01", review_state: i < 5 ? "history" : "pending" }));
  await importRows(records);
  const first = await page({ year: 2026, status: "all" });
  const second = await page({ year: 2026, page: 1, status: "all" });
  expect(first.total).toBe(82); expect(second.total).toBe(82);
  expect(first.observations).toHaveLength(50); expect(second.observations).toHaveLength(32);
  expect(new Set([...first.observations, ...second.observations].map(o => o.id)).size).toBe(82);
  expect(second.counts).toMatchObject({ total: 123, pending: 118, history: 5, unassigned: 118 });
  expect((await page({ query: "Source wedding 122", year: 2027 })).observations).toHaveLength(1);
  expect((await page({ status: "history" })).total).toBe(5);
});
it("uses the office timezone for appointment-year filtering and excludes undated records only when a year is chosen", async () => {
  await importRows([source({ source_kind: "appointment", project_date: null, starts_at: "2027-01-01T00:30:00Z", ends_at: "2027-01-01T01:00:00Z" }), source({ project_date: null })]);
  expect((await page({ kind: "appointment", year: 2026 })).total).toBe(1);
  expect((await page({ year: 2027 })).total).toBe(0);
  expect((await page()).total).toBe(2);
});
it("allows only active office actors, office-only RLS reads and no public mutation RPCs", async () => {
  expect(await action("import", randomUUID(), { records: [source()] }, null, contractor)).toEqual({ error: "Office access required." });
  expect(await page({}, inactive)).toEqual({ error: "Office access required." });
  const [row] = await importRows();
  expect(await action("review", row.id, review(), 1, coordinator)).toMatchObject({ version: 2 });
  expect((await db.query("select has_function_privilege('anon','crm_migration_action(uuid,text,uuid,integer,jsonb)','execute') mut,has_function_privilege('authenticated','crm_migration_page(uuid,text,integer,integer,text,text)','execute') rd,has_table_privilege('authenticated','crm_migration_observations','update') direct")).rows).toEqual([{ mut: false, rd: false, direct: false }]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [contractor]);
  await db.exec("set local role authenticated");
  expect((await db.query("select id from crm_migration_observations")).rows).toHaveLength(0);
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [admin]);
  await db.exec("set local role authenticated");
  expect((await db.query("select id from crm_migration_observations")).rows).toHaveLength(1);
});
