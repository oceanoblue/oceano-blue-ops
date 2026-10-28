import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
let db: PGlite;
const actor = randomUUID(),
  photographer = randomUUID(),
  typeId = randomUUID();
const start = new Date();
start.setUTCDate(start.getUTCDate() + 10);
start.setUTCHours(15, 0, 0, 0);
const settings = {
  name: "Consultation",
  slug: "consultation",
  description: "Planning",
  owner_id: actor,
  duration_minutes: 30,
  timezone: "America/New_York",
  availability: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    start: "09:00",
    end: "17:00",
  })),
  notice_minutes: 60,
  horizon_days: 90,
  buffer_minutes: 15,
  location: "Phone",
  published: true,
};
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
 create table business_settings(id boolean primary key,buffer_minutes integer);insert into business_settings values(true,30);
 create table orders(id uuid primary key,status text,scheduled_at timestamptz,duration_minutes integer,photographer_id uuid,videographer_id uuid,contractor_id uuid,photographer_start_offset_minutes integer default 0,photographer_duration_minutes integer,videographer_start_offset_minutes integer default 0,videographer_duration_minutes integer);
 insert into team_members values('${actor}','admin',true),('${photographer}','photographer',true);`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261017032908_crm_clientflow.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261017034047_crm_historical_archive.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261017115510_crm_general_scheduling.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261017120411_crm_scheduling_source_precision.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261017122113_crm_scheduling_asymmetric_buffers.sql",
      "utf8",
    ),
  );
  const crew = readFileSync(
    "supabase/migrations/20260923104656_manual_assignment_review.sql",
    "utf8",
  ).match(/create function public\.crew_windows\([\s\S]*?\$\$;/i)?.[0];
  if (!crew) throw new Error("Production crew window function is missing");
  await db.exec(crew);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261018185935_crm_order_schedule_hold_guard.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261018185938_crm_session_shoot_travel_buffer.sql",
      "utf8",
    ),
  );
  await db.exec(
    "grant select,insert,update on clients,projects,schedule_blocks,contractors,orders,business_settings to service_role",
  );

  await db.exec(
    readFileSync(
      "supabase/migrations/20261017042746_crm_acquisition_workflows.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261017114949_crm_project_billing.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261017121951_crm_billing_provider_adjustments.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261020230557_crm_smart_file_experience.sql",
      "utf8",
    ),
  );
  await db.exec(readFileSync("supabase/migrations/20261028195243_wedding_smart_file_terms.sql", "utf8"));
}, 60000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback");
});
const token = "a".repeat(64),
  packageId = randomUUID(),
  addonId = randomUUID();
async function fixture(slug = "", wedding = false, eventDate = "2030-03-31") {
  const client = randomUUID(),
    project = randomUUID(),
    template = randomUUID(),
    file = randomUUID();
  const config = {
    id: randomUUID(),
    kind: "experience",
    title: "Headshots",
    packages: [{ id: packageId, title: "Headshots", price_cents: 18000 }],
    addons: [{ id: addonId, title: "Extra image", price_cents: 5000 }],
    terms: "Approved service terms",
    session_slug: slug,
    deposit_percent: 50,
    balance_days: 14,
    tax_bps: 700,
    ...(wedding ? { balance_timing: "month_before_project", require_countersign: true } : {}),
  };
  await db.query("insert into clients(id,full_name,email) values($1,$2,$3)", [
    client,
    "Test Client",
    "client@example.com",
  ]);
  await db.query("insert into projects(id,client_id,name) values($1,$2,$3)", [
    project,
    client,
    "Headshots",
  ]);
  await db.query(
    "insert into crm_opportunities(id,project_id,client_id,title,stage_id) select $1,$1,$2,'Headshots',id from crm_stages where outcome='open' limit 1",
    [project, client],
  );
  if (wedding) await db.query("update crm_opportunities set project_date=$1 where project_id=$2", [eventDate, project]);
  await db.query(
    "insert into crm_file_templates(id,name,title,blocks,ready) values($1,'Headshots','Headshots',$2,true)",
    [template, JSON.stringify([config])],
  );
  await db.query(
    "insert into crm_issued_files(id,template_id,project_id,client_id,access_token,title,snapshot,context) values($1,$2,$3,$4,$5,'Headshots',$6,'{}')",
    [
      file,
      template,
      project,
      client,
      token,
      JSON.stringify({
        name: "Headshots",
        title: "Headshots",
        blocks: [config],
        ready: true,
      }),
    ],
  );
  return { client, project, file, config };
}
async function accept(extra: object = {}) {
  return (
    await db.query<any>("select crm_file_accept($1,$2::jsonb) r", [
      token,
      JSON.stringify({
        package_id: packageId,
        addon_ids: [addonId],
        signer_name: "Test Client",
        signer_email: "client@example.com",
        consent: true,
        agreement: "Approved service terms",
        consent_text: "I consent",
        answers: {},
        document_hash: "b".repeat(64),
        payload_hash: "c".repeat(64),
        ip_hash: "d".repeat(64),
        user_agent: "test",
        ...extra,
      }),
    ])
  ).rows[0].r;
}
it("calculates native invoice amounts from issued prices, freezes evidence and replays without duplication", async () => {
  await fixture();
  expect(await accept({ total_cents: 1 })).toEqual({ ok: true });
  expect(await accept()).toEqual({ ok: true });
  expect(
    (
      await db.query(
        "select total_cents,collection_enabled from crm_billing_invoices",
      )
    ).rows,
  ).toEqual([{ total_cents: 24610, collection_enabled: true }]);
  expect(
    (
      await db.query(
        "select amount_cents from crm_billing_installments order by due_date",
      )
    ).rows,
  ).toEqual([{ amount_cents: 12305 }, { amount_cents: 12305 }]);
  expect(
    (await db.query("select count(*)::int n from crm_file_acceptances")).rows,
  ).toEqual([{ n: 1 }]);
  await expect(
    db.query("update crm_file_acceptances set signer_name='Someone else'"),
  ).rejects.toThrow("immutable");
});
it("rejects forged extras, duplicates, missing consent, a different recipient and changed signed payloads", async () => {
  await fixture();
  for (const input of [
    { addon_ids: [randomUUID()] },
    { addon_ids: [addonId, addonId] },
    { consent: false },
    { signer_email: "other@example.com" },
    { package_id: randomUUID() },
  ])
    expect((await accept(input)).error).toBeTruthy();
  expect(
    (await db.query("select count(*)::int n from crm_billing_invoices")).rows,
  ).toEqual([{ n: 0 }]);
  await accept();
  expect((await accept({ payload_hash: "e".repeat(64) })).error).toContain(
    "already been signed",
  );
});
it("rejects expired/revoked files and archived clients without creating money records", async () => {
  const f = await fixture();
  await db.query("update clients set is_archived=true where id=$1", [f.client]);
  expect((await accept()).error).toContain("no longer");
  await db.query("update clients set is_archived=false where id=$1", [
    f.client,
  ]);
  await db.query("update crm_issued_files set revoked_at=now()");
  expect((await accept()).error).toContain("unavailable");
});
it("keeps signature tables and RPC inaccessible to public roles", async () => {
  expect(
    (
      await db.query(
        "select has_table_privilege('anon','crm_file_acceptances','select') a,has_table_privilege('authenticated','crm_file_acceptances','insert') b,has_function_privilege('anon','crm_file_accept(text,jsonb)','execute') c,has_table_privilege('service_role','crm_file_acceptances','update') d",
      )
    ).rows,
  ).toEqual([{ a: false, b: false, c: false, d: false }]);
});
it("reserves the selected calendar on the SAME project, keeps one appointment, and freezes checkout return path", async () => {
  await db.query("select crm_session_type_save($1,$2,null,$3::jsonb)", [
    actor,
    typeId,
    JSON.stringify(settings),
  ]);
  const f = await fixture("consultation");
  expect(await accept()).toEqual({ ok: true });
  expect(
    (await db.query("select collection_enabled from crm_billing_invoices"))
      .rows,
  ).toEqual([{ collection_enabled: false }]);
  const id = randomUUID(),
    body = {
      starts_at: start.toISOString(),
      full_name: "Test Client",
      email: "client@example.com",
      phone: "5555555555",
      notes: "",
      email_consent: false,
      manage_token: "f".repeat(64),
      smart_file_token: token,
    };
  const book = async (bookId = id) =>
    (
      await db.query<any>(
        "select crm_session_commit($1,$2,$3,$4::jsonb,1,now()) r",
        [bookId, "consultation", "stable", JSON.stringify(body)],
      )
    ).rows[0].r;
  expect(await book()).toMatchObject({ ok: true, id });
  expect(await book()).toMatchObject({ ok: true, id });
  expect(
    (await db.query("select project_id,client_id from crm_appointments")).rows,
  ).toEqual([{ project_id: f.project, client_id: f.client }]);
  expect((await db.query("select count(*)::int n from projects")).rows).toEqual(
    [{ n: 1 }],
  );
  expect(
    (await db.query("select collection_enabled from crm_billing_invoices"))
      .rows,
  ).toEqual([{ collection_enabled: true }]);
  const pay = (
    await db.query<any>(
      "select crm_billing_reserve(access_token) r from crm_billing_installments order by due_date limit 1",
    )
  ).rows[0].r;
  expect(pay.checkout.return_path).toBe(`/smart-files/${token}`);
  await db.query("update crm_appointments set status='cancelled' where id=$1",[id]);
  expect((await db.query("select collection_enabled from crm_billing_invoices")).rows).toEqual([{collection_enabled:false}]);
  await expect(book(randomUUID())).rejects.toThrow("already reserved");
});

it("keeps the configured balance window accessible and holds payment when its file is revoked",async()=>{
 await fixture();await accept();
 expect((await db.query<{valid:boolean}>("select expires_at>now()+interval '100 days' valid from crm_issued_files")).rows[0].valid).toBe(true);
 await db.query("update crm_issued_files set revoked_at=now()");
 expect((await db.query("select collection_enabled from crm_billing_invoices")).rows).toEqual([{collection_enabled:false}]);
});
it('advances the original project only when the booking installment is credited, not the remaining balance',async()=>{
 await fixture();await accept();
 await db.query("update crm_billing_installments set paid_cents=amount_cents where title='Remaining balance'");
 expect((await db.query("select s.outcome from crm_opportunities o join crm_stages s on s.id=o.stage_id")).rows).toEqual([{outcome:'open'}]);
 await db.query("update crm_billing_installments set paid_cents=amount_cents where title='Booking deposit'");
 expect((await db.query("select s.outcome from crm_opportunities o join crm_stages s on s.id=o.stage_id")).rows).toEqual([{outcome:'won'}]);
});


it("freezes a calendar-month wedding deadline, including short months, and rejects later project-date changes", async () => {
 const { project } = await fixture("", true);
 const issued = (await db.query<any>("select context,expires_at from crm_issued_files")).rows[0];
 expect(issued.context.project_date).toBe("2030-03-31");
 expect(issued.context.balance_due_date).toBe("2030-02-28");
 expect(new Date(issued.expires_at).getTime()).toBeGreaterThan(Date.parse("2030-03-31"));
 await db.query("update crm_opportunities set project_date='2030-04-01' where project_id=$1", [project]);
 expect((await accept()).error).toMatch(/event date changed/i);
 expect((await db.query("select * from crm_billing_invoices")).rows).toHaveLength(0);
 await db.query("update crm_opportunities set project_date='2030-03-31' where project_id=$1", [project]);
 expect(await accept()).toEqual({ok:true});
 expect((await db.query<any>("select due_date::text due from crm_billing_installments where title='Remaining balance'")).rows[0].due).toBe("2030-02-28");
});

it("refuses to issue wedding terms with a missing or already-past payment deadline", async () => {
 await expect(fixture("",true,"2020-03-31")).rejects.toThrow(/Review payment terms/);
});

it("records a separate immutable, authorized office signature against the exact client acceptance", async () => {
 const {file} = await fixture("",true);
 const data = { signer_name:"Test Office", consent:true, document_hash:"b".repeat(64),payload_hash:"c".repeat(64),consent_text:"I consent",ip_hash:"e".repeat(64),user_agent:"test" };
 const sign = async (who=actor,patch={}) => (await db.query<any>("select crm_file_countersign($1,$2,$3) r",[who,file,JSON.stringify({...data,...patch})])).rows[0].r;
 expect((await sign()).error).toMatch(/client must sign/i);
 await accept();
 expect((await sign(photographer)).error).toMatch(/office access/i);
 expect((await sign(actor,{consent:false})).error).toMatch(/confirm/);
 expect((await sign(actor,{payload_hash:"f".repeat(64)})).error).toMatch(/changed/);
 expect(await sign()).toEqual({ok:true});
 expect(await sign()).toEqual({ok:true});
 expect((await sign(actor,{signer_name:"Different"})).error).toMatch(/already/);
 expect((await db.query("select * from crm_file_countersignatures")).rows).toHaveLength(1);
 expect((await db.query("select * from crm_file_acceptances")).rows).toHaveLength(1);
 await expect(db.query("update crm_file_countersignatures set signer_name='Altered' ")).rejects.toThrow(/immutable/);
});

it("does not grant clients or anonymous callers office signing privileges", async () => {
 const row=(await db.query<any>("select has_table_privilege('anon','crm_file_countersignatures','select') a,has_table_privilege('authenticated','crm_file_countersignatures','insert') b,has_function_privilege('anon','crm_file_countersign(uuid,uuid,jsonb)','execute') c,has_function_privilege('authenticated','crm_file_countersign(uuid,uuid,jsonb)','execute') d")).rows[0];
 expect(row).toEqual({a:false,b:false,c:false,d:false});
});
