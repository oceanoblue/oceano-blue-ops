import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
let db: PGlite;
const actor = randomUUID(), photographer = randomUUID(), typeId = randomUUID();
const start = new Date();
start.setUTCDate(start.getUTCDate() + 10);
start.setUTCHours(15, 0, 0, 0);
const settings = { name: "Consultation", slug: "consultation", description: "Planning", owner_id: actor, duration_minutes: 30, timezone: "America/New_York", availability: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, start: "09:00", end: "17:00" })), notice_minutes: 60, horizon_days: 90, buffer_minutes: 15, location: "Phone", published: true };
beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 create table team_members(id uuid primary key,role text,is_active boolean);grant select on team_members to authenticated,service_role;
 create table clients(id uuid primary key default gen_random_uuid(),full_name text,email text unique,phone text,brokerage text,notes text,billing_address text,is_archived boolean default false,created_at timestamptz default now(),updated_at timestamptz default now());
 create table projects(id uuid primary key default gen_random_uuid(),client_id uuid references clients(id),name text,description text,start_date date,created_by uuid,metadata jsonb default '{}',status text default 'active',updated_at timestamptz default now());
 create table schedule_blocks(id uuid primary key,team_member_id uuid,starts_at timestamptz,ends_at timestamptz,reason text,is_available boolean);
 create table contractors(id uuid primary key,team_member_id uuid);
 create table orders(id uuid primary key,status text,scheduled_at timestamptz,duration_minutes integer,photographer_id uuid,videographer_id uuid,contractor_id uuid,photographer_start_offset_minutes integer,photographer_duration_minutes integer,videographer_start_offset_minutes integer,videographer_duration_minutes integer);
 insert into team_members values('${actor}','admin',true),('${photographer}','photographer',true);`);
    await db.exec(readFileSync("supabase/migrations/20261017032908_crm_clientflow.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261017034047_crm_historical_archive.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261017115510_crm_general_scheduling.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261017120411_crm_scheduling_source_precision.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261017122113_crm_scheduling_asymmetric_buffers.sql", "utf8"));
    await db.exec("grant select,insert,update on clients,projects,schedule_blocks,contractors,orders to service_role");
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
async function typeSave(data: object = settings, version: number | null = null, by = actor, id = typeId) { return (await db.query<any>("select crm_session_type_save($1,$2,$3,$4::jsonb) r", [by, id, version, JSON.stringify(data)])).rows[0].r; }
async function book(id = randomUUID(), extra: Record<string, unknown> = {}, hash = "same", slug = "consultation") {
    const data = { full_name: "Test Client", email: "client@example.test", phone: "8435550100", notes: "No sends in tests", starts_at: start.toISOString(), manage_token: randomUUID().replaceAll("-", "").repeat(2), email_consent: false, ...extra };
    return (await db.query<any>("select crm_session_commit($1,$2,$3,$4::jsonb,1,clock_timestamp()) r", [id, slug, hash, JSON.stringify(data)])).rows[0].r;
}
async function failed(run: () => Promise<unknown>) { await db.exec("savepoint expected_error"); let message = ""; try {
    await run();
}
catch (e) {
    message = e instanceof Error ? e.message : String(e);
} await db.exec("rollback to savepoint expected_error"); expect(message).not.toBe(""); return message; }
async function change(id: string, token: string, action: string, version = 1, newStart: string | null = null, typeVersion = 1) { return db.query<any>("select crm_session_change($1,$2,null,$3,$4,$5,clock_timestamp(),$6) r", [id, token, action, version, newStart, typeVersion]); }
it("books once, links contact/project/task, and blocks shoots through schedule_blocks", async () => {
    await typeSave();
    const id = randomUUID(), first = await book(id);
    expect(first.ok).toBe(true);
    expect((await book(id)).token).toBe(first.token);
    const counts = (await db.query<any>("select (select count(*) from crm_appointments)::int a,(select count(*) from clients)::int c,(select count(*) from crm_opportunities)::int p,(select count(*) from crm_tasks)::int t,(select count(*) from schedule_blocks where not is_available)::int b,(select count(*) from crm_session_notifications)::int n")).rows[0];
    expect(counts).toEqual({ a: 1, c: 1, p: 1, t: 1, b: 1, n: 4 });
    expect(await failed(() => book(id, {}, "changed"))).toContain("already used");
    expect(await failed(() => book())).toContain("just booked");
});
it("prevents overlap across reusable links and observes existing shoots and blocks", async () => {
    await typeSave();
    await typeSave({ ...settings, slug: "portrait", duration_minutes: 60 }, null, actor, randomUUID());
    await book();
    expect(await failed(() => book(randomUUID(), {}, "other", "portrait"))).toContain("just booked");
    await db.exec("delete from crm_session_notifications;delete from crm_appointments;delete from schedule_blocks");
    await db.query("insert into orders(id,status,scheduled_at,duration_minutes,photographer_id) values($1,'scheduled',$2,60,$3)", [randomUUID(), start.toISOString(), actor]);
    expect(await failed(() => book())).toContain("just booked");
});
it("requires source freshness, hours, current version and active office host", async () => {
    await typeSave();
    expect(await failed(() => book(randomUUID(), { starts_at: new Date(start.getTime() + 20 * 3600000).toISOString() }))).toContain("unavailable");
    expect(await failed(() => db.query("select crm_session_commit($1,'consultation','x',$2::jsonb,1,now()-interval '3 minutes')", [randomUUID(), JSON.stringify({ starts_at: start.toISOString() })]))).toContain("expired");
    expect(await failed(() => typeSave(settings, null, photographer, randomUUID()))).toContain("Office access");
    expect(await failed(() => typeSave({ ...settings, owner_id: photographer }, 1))).toContain("active office");
});
it("requires private management, uses optimistic versions and releases cancelled reservations", async () => {
    await typeSave();
    const b = await book();
    expect(await failed(() => change(b.id, "f".repeat(64), "cancel"))).toContain("not found");
    const next = new Date(start.getTime() + 2 * 3600000).toISOString();
    await change(b.id, b.token, "reschedule", 1, next);
    expect(await failed(() => change(b.id, b.token, "cancel"))).toContain("Record changed");
    await change(b.id, b.token, "cancel", 2);
    expect((await db.query<any>("select status,version from crm_appointments")).rows[0]).toEqual({ status: "cancelled", version: 3 });
    expect((await db.query<any>("select count(*)::int n from schedule_blocks where not is_available")).rows[0].n).toBe(0);
});
it("only queues opted-in client mail and invalidates earlier pending reminders after a change", async () => {
    await typeSave();
    const b = await book(randomUUID(), { email_consent: true });
    expect((await db.query<any>("select count(*)::int n from crm_session_notifications")).rows[0].n).toBe(7);
    expect((await db.query<any>("select count(*)::int n from crm_session_notifications where audience='office'")).rows[0].n).toBe(4);
    await change(b.id, b.token, "cancel");
    const jobs = (await db.query<any>("select kind,status from crm_session_notifications order by kind")).rows;
    expect(jobs).toContainEqual({ kind: "confirmation", status: "cancelled" });
    expect(jobs).toContainEqual({ kind: "reminder", status: "cancelled" });
    expect(jobs).toContainEqual({ kind: "cancelled", status: "pending" });
    const claimed = (await db.query<any>("select * from crm_claim_session_notifications(3)")).rows;
    expect(claimed).toHaveLength(1);
    expect(claimed[0].kind).toBe("calendar");
    expect((await db.query<any>("select * from crm_claim_session_notifications(3)")).rows).toHaveLength(0);
});
it("deduplicates verified source imports and keeps source evidence immutable with no client messages", async () => {
    await typeSave();
    const b = await book();
    const a = (await db.query<any>("select * from crm_appointments where id=$1", [b.id])).rows[0];
    const id = randomUUID(), data = { source_system: "honeybook", source_id: "verified-source-event", source_evidence: { url: "https://app.honeybook.com/source", original_starts_at: start.toISOString() }, owner_id: actor, client_id: a.client_id, project_id: a.project_id, title: "Imported filming", starts_at: new Date(start.getTime() + 86400000).toISOString(), ends_at: new Date(start.getTime() + 86400000 + 8 * 3600000).toISOString(), timezone: "America/New_York", manage_token: "a".repeat(64) };
    const run = async () => (await db.query<any>("select crm_session_import($1,$2,$3::jsonb) r", [actor, id, JSON.stringify(data)])).rows[0].r;
    expect((await run()).skipped).toBe(false);
    expect((await run()).skipped).toBe(true);
    expect((await db.query<any>("select count(*)::int n from crm_session_notifications where audience='client'")).rows[0].n).toBe(0);
    expect(await failed(() => db.query("update crm_appointments set source_id='changed' where id=$1", [id]))).toContain("immutable");
    expect(await failed(() => change(id, "a".repeat(64), "cancel"))).toContain("source system");
});
it("denies anonymous RPC/table access and hides appointments from photographers", async () => {
    await typeSave();
    await book();
    expect((await db.query<any>("select has_function_privilege('anon','public.crm_session_commit(uuid,text,text,jsonb,integer,timestamptz)','execute') allowed")).rows[0].allowed).toBe(false);
    expect((await db.query<any>("select has_table_privilege('anon','public.crm_appointments','select') allowed")).rows[0].allowed).toBe(false);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [photographer]);
    await db.exec("set local role authenticated");
    expect((await db.query<any>("select count(*)::int n from crm_appointments")).rows[0].n).toBe(0);
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
    await db.exec("set local role authenticated");
    expect((await db.query<any>("select count(*)::int n from crm_appointments")).rows[0].n).toBe(1);
});
it("enforces source increments in SQL, snapshots the project date and preserves an office date override",async()=>{
 await typeSave({...settings,slot_interval_minutes:60,use_session_as_project_date:true});const b=await book();const date=await db.query<any>("select a.project_id,(a.starts_at at time zone a.timezone)::date::text as slot_day,p.start_date::text project_date from crm_appointments a join projects p on p.id=a.project_id where a.id=$1",[b.id]);expect(date.rows[0].project_date).toBe(date.rows[0].slot_day);
 expect(await failed(()=>book(randomUUID(),{starts_at:new Date(start.getTime()+30*60000).toISOString()}))).toContain("unavailable");
 const next=new Date(start.getTime()+86400000).toISOString();await change(b.id,b.token,"reschedule",1,next);expect((await db.query<any>("select p.start_date::text as slot_day,(a.starts_at at time zone a.timezone)::date::text expected from projects p join crm_appointments a on a.project_id=p.id where a.id=$1",[b.id])).rows[0]).toMatchObject({slot_day:next.slice(0,10),expected:next.slice(0,10)});
 await db.query("update projects set start_date='2030-01-01' where id=$1",[date.rows[0].project_id]);await change(b.id,b.token,"reschedule",2,new Date(start.getTime()+2*86400000).toISOString());expect((await db.query<any>("select start_date::text as slot_day from projects where id=$1",[date.rows[0].project_id])).rows[0].slot_day).toBe("2030-01-01");
});
it("uses exact calendar-month boundaries independently of the fallback days horizon",async()=>{
 await typeSave({...settings,horizon_days:365,booking_horizon_months:1});const {rows}=await db.query<any>("select (((now() at time zone 'America/New_York')::date+interval '1 month')::date+time '11:00') at time zone 'America/New_York' at");const boundary=new Date(rows[0].at).toISOString();await book(randomUUID(),{starts_at:boundary});expect(await failed(()=>book(randomUUID(),{starts_at:new Date(Date.parse(boundary)+86400000).toISOString()}))).toContain("unavailable");
});
it("validates phone-session contact details in SQL and works under the real service role",async()=>{
 await typeSave();expect(await failed(()=>book(randomUUID(),{phone:"123"}))).toContain("phone number");await db.exec("set local role service_role");const b=await book();await change(b.id,b.token,"cancel");expect((await db.query<any>("select status from crm_appointments where id=$1",[b.id])).rows[0].status).toBe("cancelled");await db.exec("reset role");
});
it("reserves asymmetric buffers, blocks both neighboring links and reschedules with current buffers", async () => {
    await typeSave({ ...settings, name: "Commercial filming", buffer_before_minutes: 30, buffer_after_minutes: 60 });
    const b = await book();
    const reservation = async () => (await db.query<any>("select (extract(epoch from (a.starts_at-b.starts_at))/60)::int as before,(extract(epoch from (b.ends_at-a.ends_at))/60)::int as after,a.buffer_before_minutes,a.buffer_after_minutes,o.project_type from crm_appointments a join schedule_blocks b on b.id=a.schedule_block_id join crm_opportunities o on o.project_id=a.project_id where a.id=$1", [b.id])).rows[0];
    expect(await reservation()).toMatchObject({ before: 30, after: 60, buffer_before_minutes: 30, buffer_after_minutes: 60, project_type: "Commercial filming" });
    await typeSave({ ...settings, slug: "neighbor", buffer_minutes: 0 }, null, actor, randomUUID());
    expect(await failed(() => book(randomUUID(), { starts_at: new Date(start.getTime() - 45 * 60000).toISOString() }, "before", "neighbor"))).toContain("just booked");
    expect(await failed(() => book(randomUUID(), { starts_at: new Date(start.getTime() + 75 * 60000).toISOString() }, "after", "neighbor"))).toContain("just booked");
    await book(randomUUID(), { starts_at: new Date(start.getTime() + 90 * 60000).toISOString() }, "touching", "neighbor");
    await typeSave({ ...settings, name: "Commercial filming", buffer_before_minutes: 0, buffer_after_minutes: 45 }, 1);
    await change(b.id, b.token, "reschedule", 1, new Date(start.getTime() + 86400000).toISOString(), 2);
    expect(await reservation()).toMatchObject({ before: 0, after: 45, buffer_before_minutes: 0, buffer_after_minutes: 45 });
});
it("freezes preparation instructions at booking across later template edits and reschedules", async () => {
    const original = "Bring two outfits.\nPlease arrive ten minutes early.";
    await typeSave({ ...settings, confirmation_instructions: original });
    const b = await book();
    await typeSave({ ...settings, confirmation_instructions: "New instructions for future bookings." }, 1);
    await change(b.id, b.token, "reschedule", 1, new Date(start.getTime() + 86400000).toISOString(), 2);
    const { rows } = await db.query<any>("select a.confirmation_instructions as snapshot,t.confirmation_instructions as current from crm_appointments a join crm_session_types t on t.id=a.session_type_id where a.id=$1", [b.id]);
    expect(rows[0]).toEqual({ snapshot: original, current: "New instructions for future bookings." });
});
