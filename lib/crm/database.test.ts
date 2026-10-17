import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
let db: PGlite;
const admin = randomUUID(),
  coordinator = randomUUID(),
  photographer = randomUUID(),
  client = randomUUID();
const contact = {
  full_name: "Test Client",
  email: "client@example.test",
  phone: "123",
  company: "Test Co",
  billing_address: "Test address",
  notes: "Internal",
  tags: ["commercial"],
  status: "lead",
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 create table team_members(id uuid primary key,role text,is_active boolean);
 alter table team_members enable row level security;create policy own_team on team_members for select to authenticated using(id=auth.uid());grant select on team_members to authenticated,service_role;
 create table clients(id uuid primary key default gen_random_uuid(),full_name text,email text unique,phone text,brokerage text,notes text,billing_address text,is_archived boolean default false,created_at timestamptz default now(),updated_at timestamptz default now());
 create table projects(id uuid primary key default gen_random_uuid(),client_id uuid references clients(id),name text,description text,start_date date,created_by uuid,metadata jsonb default '{}',status text default 'active',updated_at timestamptz default now());
 grant select,insert,update on clients,projects to service_role;
 insert into team_members values('${admin}','admin',true),('${coordinator}','coordinator',true),('${photographer}','photographer',true);
 `);
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
      "supabase/migrations/20261017042746_crm_acquisition_workflows.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261017043251_crm_acquisition_booked_files.sql",
      "utf8",
    ),
  );
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
async function act(
  action: string,
  id: string,
  data: object,
  version: number | null = null,
  actor = admin,
) {
  return (
    await db.query<any>("select crm_action($1,$2,$3,$4,$5::jsonb) result", [
      actor,
      action,
      id,
      version,
      JSON.stringify(data),
    ])
  ).rows[0].result;
}
async function newContact() {
  const id = randomUUID();
  expect((await act("contact_create", id, contact)).id).toBe(id);
  return id;
}
async function stage() {
  return (await db.query<any>("select id from crm_stages where name='Inquiry'"))
    .rows[0].id;
}
async function deal(cid: string) {
  return {
    client_id: cid,
    title: "Commercial film",
    stage_id: await stage(),
    project_type: "Video",
    lead_source: "Referral",
    value_cents: 300000,
    project_date: null,
    next_follow_up: null,
    owner_id: admin,
    description: "A test brief",
    lost_reason: "",
  };
}
const fields = [
  { key: "full_name", label: "Name", type: "text", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  {
    key: "project_type",
    label: "Type",
    type: "select",
    required: true,
    options: ["Video", "Photo"],
  },
];
async function form() {
  const id = randomUUID();
  await act(
    "form_save",
    id,
    {
      name: "Website",
      slug: "test-contact",
      title: "Contact",
      description: "A form",
      success_message: "Received",
      published: true,
      fields,
      default_project_type: "",
      owner_id: admin,
    },
    0,
  );
  return id;
}
async function submit(
  fid: string,
  id = randomUUID(),
  hash = "abc",
  answers: object = {
    full_name: "Lead",
    email: "lead@example.test",
    project_type: "Video",
  },
) {
  return (
    await db.query<any>(
      "select crm_submit_inquiry($1,$2,$3,$4::jsonb,$5::jsonb) result",
      [fid, id, hash, JSON.stringify(answers), "{}"],
    )
  ).rows[0].result;
}
async function asUser(id: string) {
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  await db.exec("set local role authenticated");
}
it("creates a contact in the existing Ops client table and profile atomically", async () => {
  const id = await newContact();
  expect(
    (
      await db.query<any>(
        "select c.email,p.tags from clients c join crm_contact_profiles p on p.client_id=c.id where c.id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ email: contact.email, tags: ["commercial"] });
  expect((await db.query("select * from crm_events")).rows).toHaveLength(1);
});
it("updates existing Ops contacts without requiring a pre-existing CRM profile", async () => {
  const id = randomUUID();
  await db.query("insert into clients(id,full_name,email) values($1,$2,$3)", [
    id,
    "Existing",
    "existing@test.com",
  ]);
  expect(await act("contact_update", id, contact, 1)).toMatchObject({
    version: 2,
  });
});
it("rejects stale edits and retains the saved contact", async () => {
  const id = await newContact();
  await act("contact_update", id, { ...contact, full_name: "Changed" }, 1);
  expect(
    await act("contact_update", id, { ...contact, full_name: "Stale" }, 1),
  ).toEqual({ error: "Record changed. Reload before saving." });
  expect(
    (await db.query<any>("select full_name from clients where id=$1", [id]))
      .rows[0].full_name,
  ).toBe("Changed");
});
it("uses a shared project ID and synchronizes project metadata with the sales record", async () => {
  const cid = await newContact(),
    id = randomUUID(),
    data = await deal(cid);
  await act("deal_create", id, data);
  await act("deal_update", id, { ...data, title: "Updated film" }, 1);
  expect(
    (await db.query<any>("select name from projects where id=$1", [id])).rows[0]
      .name,
  ).toBe("Updated film");
  expect(
    (
      await db.query<any>("select version from crm_opportunities where id=$1", [
        id,
      ])
    ).rows[0].version,
  ).toBe(2);
});
it("prevents moving a project under a different contact or unrelated notes", async () => {
  const cid = await newContact(),
    id = randomUUID(),
    data = await deal(cid);
  await act("deal_create", id, data);
  const other = randomUUID();
  await act("contact_create", other, {
    ...contact,
    email: "other@example.test",
  });
  expect(
    (await act("deal_update", id, { ...data, client_id: other }, 1)).error,
  ).toBe("Project contact cannot be reassigned.");
  expect(
    (
      await act("note", randomUUID(), {
        client_id: other,
        project_id: id,
        body: "Incorrect",
      })
    ).error,
  ).toBe("Project does not belong to this contact.");
});
it("atomically saves form, project, answers, contact, event and automation task", async () => {
  const fid = await form();
  await act("automation_save", randomUUID(), {
    name: "Reply",
    enabled: true,
    trigger: "inquiry_received",
    stage_id: null,
    task_title: "Follow up",
    delay_hours: 24,
  });
  expect(await submit(fid)).toEqual({ ok: true });
  for (const table of [
    "clients",
    "projects",
    "crm_opportunities",
    "crm_submissions",
    "crm_contact_profiles",
    "crm_tasks",
  ])
    expect((await db.query(`select * from ${table}`)).rows).toHaveLength(1);
  expect(
    (await db.query<any>("select form_snapshot from crm_submissions")).rows[0]
      .form_snapshot.fields,
  ).toEqual(fields);
});
it("makes public retries idempotent and rejects mismatched IDs without leaking record IDs", async () => {
  const fid = await form(),
    id = randomUUID();
  expect(await submit(fid, id)).toEqual({ ok: true });
  expect(await submit(fid, id)).toEqual({ ok: true });
  expect(await submit(fid, id, "changed")).toEqual({
    error: "Submission ID already used.",
  });
  expect((await db.query("select * from projects")).rows).toHaveLength(1);
});
it("never overwrites existing client details from an unauthenticated form", async () => {
  const cid = await newContact(),
    fid = await form();
  await submit(fid, randomUUID(), "abc", {
    full_name: "Imposter",
    email: contact.email,
    project_type: "Video",
    phone: "Wrong",
  });
  expect(
    (
      await db.query<any>(
        "select full_name,phone,notes from clients where id=$1",
        [cid],
      )
    ).rows[0],
  ).toEqual({ full_name: contact.full_name, phone: "123", notes: "Internal" });
});
it("rejects unpublished forms, missing required values, invalid choices and invalid email", async () => {
  const fid = await form();
  expect(
    (
      await submit(fid, randomUUID(), "abc", {
        full_name: "Lead",
        email: "lead@example.test",
        project_type: "Unlisted",
      })
    ).error,
  ).toBe("Invalid option.");
  expect(
    (
      await submit(fid, randomUUID(), "abc", {
        email: "lead@example.test",
        project_type: "Video",
      })
    ).error,
  ).toBe("Required field missing.");
  expect(
    (
      await submit(fid, randomUUID(), "abc", {
        full_name: "Lead",
        email: "bad",
        project_type: "Video",
      })
    ).error,
  ).toBe("Invalid contact details.");
  await db.query("update crm_forms set published=false where id=$1", [fid]);
  expect((await submit(fid)).error).toBe("Form unavailable.");
  expect((await db.query("select * from clients")).rows).toHaveLength(0);
});
it("fires a stage task once for an actual stage transition", async () => {
  const cid = await newContact(),
    id = randomUUID(),
    data = await deal(cid);
  await act("deal_create", id, data);
  const won = (
    await db.query<any>("select id from crm_stages where name='Retainer paid'")
  ).rows[0].id;
  await act("automation_save", randomUUID(), {
    name: "Prepare",
    enabled: true,
    trigger: "stage_changed",
    stage_id: won,
    task_title: "Prepare shoot",
    delay_hours: 0,
  });
  await act("deal_update", id, { ...data, stage_id: won }, 1);
  await act("deal_update", id, { ...data, stage_id: won }, 2);
  expect((await db.query("select * from crm_tasks")).rows).toHaveLength(1);
  expect(
    (await act("deal_update", id, { ...data, stage_id: won }, 1)).error,
  ).toBeTruthy();
});
it("imports once, skips duplicates and preserves existing client data", async () => {
  await newContact();
  const id = randomUUID(),
    data = { contacts: [contact, { ...contact, email: "new@example.test" }] };
  expect(await act("import", id, data)).toEqual({ id, added: 1, skipped: 1 });
  expect(await act("import", id, data)).toEqual({ id, added: 1, skipped: 1 });
  expect((await act("import", id, { contacts: [contact] })).error).toBe(
    "Import ID already used.",
  );
  expect((await db.query("select * from clients")).rows).toHaveLength(2);
});
it("preserves immutable inquiry and activity history", async () => {
  await submit(await form());
  await expect(db.exec("delete from crm_events")).rejects.toThrow(
    /append-only/,
  );
});
it("does not grant browsers writes or service-only RPC access", async () => {
  const result = (
    await db.query<any>(
      "select has_table_privilege('anon','crm_submissions','select') anon_read,has_table_privilege('authenticated','crm_tasks','update') client_write,has_function_privilege('authenticated','crm_action(uuid,text,uuid,integer,jsonb)','execute') client_rpc,has_function_privilege('authenticated','crm_report()','execute') report_rpc",
    )
  ).rows[0];
  expect(result).toEqual({
    anon_read: false,
    client_write: false,
    client_rpc: false,
    report_rpc: false,
  });
});
it.each([client, photographer])(
  "hides CRM data from non-office user %s",
  async (actor) => {
    await newContact();
    await asUser(actor);
    expect(
      (await db.query("select * from crm_contact_profiles")).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from crm_stages")).rows).toHaveLength(0);
  },
);
it("allows active office coordinators and rechecks deactivated actors", async () => {
  const id = randomUUID();
  expect((await act("contact_create", id, contact, null, coordinator)).id).toBe(
    id,
  );
  await asUser(coordinator);
  expect(
    (await db.query("select * from crm_contact_profiles")).rows,
  ).toHaveLength(1);
});
it("denies a forged photographer actor even through the service RPC", async () => {
  expect(
    (await act("contact_create", randomUUID(), contact, null, photographer))
      .error,
  ).toBe("Office access required.");
});
it("validates task ownership and stale completion requests", async () => {
  const id = randomUUID();
  await act("task_create", id, {
    title: "Follow up",
    client_id: null,
    project_id: null,
    due_at: null,
    owner_id: admin,
  });
  expect(await act("task_update", id, { completed: true }, 1)).toMatchObject({
    version: 2,
  });
  expect(
    (await act("task_update", id, { completed: false }, 1)).error,
  ).toBeTruthy();
});
it("calculates reports over all opportunities, including empty stages", async () => {
  const cid = await newContact();
  await act("deal_create", randomUUID(), await deal(cid));
  const result = (await db.query<any>("select crm_report() result")).rows[0]
    .result;
  expect(result.contacts).toBe(1);
  expect(result.stages).toHaveLength(13);
  expect(result.stages.find((s: any) => s.name === "Inquiry")).toMatchObject({
    count: 1,
    value_cents: 300000,
  });
});
it("searches all contacts and projects with literal text and stable pagination", async () => {
  const cid = await newContact();
  await act("deal_create", randomUUID(), await deal(cid));
  const search = async (q: string, tag = "", page = 0) =>
    (
      await db.query<any>("select crm_page($1,$2,null,null,$3) result", [
        q,
        tag,
        page,
      ])
    ).rows[0].result;
  expect((await search("CLIENT@EXAMPLE")).contacts[0]).toMatchObject({
    id: cid,
    crm_contact_profiles: { tags: ["commercial"] },
  });
  expect((await search("commercial")).deals).toHaveLength(1);
  expect((await search("", "missing")).contacts).toHaveLength(0);
  expect((await search("%'),id.eq.secret")).contacts).toHaveLength(0);
  expect((await search("", "", 1)).contacts).toHaveLength(0);
  expect((await search("")).tags).toEqual(["commercial"]);
});

async function importProjects(
  projects: object[],
  id = randomUUID(),
  actor = admin,
) {
  return (
    await db.query<any>(
      "select crm_import_honeybook_projects($1,$2,$3::jsonb) result",
      [actor, id, JSON.stringify({ projects })],
    )
  ).rows[0].result;
}
const history = {
  source_id: "hb-project-001",
  title: "Finished brand film",
  client_name: "Historic Client",
  client_email: "history@example.test",
  original_stage: "Inquiry",
  project_type: "Video",
  lead_source: "Referral",
  project_date: "2020-03-15",
  value_cents: 250000,
  description: "Preserved project notes",
};
it("imports every historical HoneyBook project into Archived regardless of stale source stage", async () => {
  await act("automation_save", randomUUID(), {
    name: "Any stage",
    enabled: true,
    trigger: "stage_changed",
    stage_id: null,
    task_title: "Do not create",
    delay_hours: 0,
  });
  const result = await importProjects([
    history,
    {
      ...history,
      source_id: "hb-project-002",
      original_stage: "Proposal sent",
      title: "Another completed project",
    },
  ]);
  expect(result).toMatchObject({
    added: 2,
    skipped: 0,
    destination: "archived",
  });
  const rows = (
    await db.query<any>(
      "select o.next_follow_up,o.owner_id,s.outcome,p.status,p.metadata from crm_opportunities o join crm_stages s on s.id=o.stage_id join projects p on p.id=o.project_id",
    )
  ).rows;
  expect(rows).toHaveLength(2);
  for (const row of rows)
    expect(row).toMatchObject({
      next_follow_up: null,
      owner_id: null,
      outcome: "archived",
      status: "archived",
      metadata: { source: "honeybook" },
    });
  expect((await db.query("select * from crm_tasks")).rows).toHaveLength(0);
  expect(
    (
      await db.query<any>(
        "select original_stage from crm_honeybook_projects order by source_id",
      )
    ).rows,
  ).toEqual([
    { original_stage: "Inquiry" },
    { original_stage: "Proposal sent" },
  ]);
});
it("keeps archived projects out of the active pipeline but available in Archived and contact history", async () => {
  await importProjects([history]);
  const archived = (
    await db.query<any>("select id from crm_stages where outcome='archived'")
  ).rows[0].id;
  const active = (
    await db.query<any>("select crm_page('','',null,null,0) result")
  ).rows[0].result;
  expect(active.deals).toHaveLength(0);
  expect(active.contacts).toHaveLength(1);
  expect(
    (await db.query<any>("select crm_page('','',$1,null,0) result", [archived]))
      .rows[0].result.deals,
  ).toHaveLength(1);
  const report = (await db.query<any>("select crm_report() result")).rows[0]
    .result;
  expect(report.sources).toHaveLength(0);
  expect(report.stages.find((s: any) => s.outcome === "archived").count).toBe(
    1,
  );
});
it("skips reimported source IDs without changing projects that were intentionally reopened", async () => {
  const batch = randomUUID();
  expect(await importProjects([history], batch)).toMatchObject({ added: 1 });
  expect(await importProjects([history], batch)).toMatchObject({ added: 1 });
  const row = (await db.query<any>("select * from crm_opportunities")).rows[0];
  const current = await deal(row.client_id);
  await act(
    "deal_update",
    row.id,
    { ...current, title: "Explicitly reopened" },
    1,
  );
  expect(await importProjects([history], randomUUID())).toMatchObject({
    added: 0,
    skipped: 1,
  });
  expect(
    (await db.query<any>("select title,stage_id from crm_opportunities"))
      .rows[0],
  ).toEqual({ title: "Explicitly reopened", stage_id: await stage() });
});
it("preserves current Ops client details and unrelated active projects during historical imports", async () => {
  const cid = await newContact(),
    id = randomUUID();
  await act("deal_create", id, await deal(cid));
  await importProjects([
    {
      ...history,
      client_email: contact.email,
      client_name: "Stale HoneyBook name",
    },
  ]);
  expect(
    (await db.query<any>("select full_name from clients where id=$1", [cid]))
      .rows[0].full_name,
  ).toBe(contact.full_name);
  expect(
    (await db.query<any>("select status from projects where id=$1", [id]))
      .rows[0].status,
  ).toBe("active");
});
it("pauses existing tasks and clears follow-up dates when archiving, without creating archive-triggered tasks", async () => {
  const cid = await newContact(),
    id = randomUUID(),
    data = { ...(await deal(cid)), next_follow_up: "2026-01-01T10:00:00Z" };
  await act("deal_create", id, data);
  const task = randomUUID();
  await act("task_create", task, {
    title: "Old follow-up",
    client_id: cid,
    project_id: id,
    due_at: "2026-01-01T10:00:00Z",
    owner_id: admin,
  });
  const archive = (
    await db.query<any>("select id from crm_stages where outcome='archived'")
  ).rows[0].id;
  await act("automation_save", randomUUID(), {
    name: "Any stage",
    enabled: true,
    trigger: "stage_changed",
    stage_id: null,
    task_title: "Should not run",
    delay_hours: 0,
  });
  await act("deal_update", id, { ...data, stage_id: archive }, 1);
  expect(
    (
      await db.query<any>(
        "select next_follow_up from crm_opportunities where id=$1",
        [id],
      )
    ).rows[0].next_follow_up,
  ).toBeNull();
  const tasks = (
    await db.query<any>("select completed_at,paused_at from crm_tasks")
  ).rows;
  expect(tasks).toHaveLength(1);
  expect(tasks[0].completed_at).toBeNull();
  expect(tasks[0].paused_at).not.toBeNull();
  expect(
    (await db.query<any>("select crm_report() result")).rows[0].result.overdue,
  ).toBe(0);
  expect(
    (
      await act("task_create", randomUUID(), {
        title: "New follow-up",
        client_id: cid,
        project_id: id,
        due_at: null,
        owner_id: admin,
      })
    ).error,
  ).toMatch(/Reopen/);
});
it("does not resume paused tasks when a historical project is reopened", async () => {
  const cid = await newContact(),
    id = randomUUID(),
    data = await deal(cid);
  await act("deal_create", id, data);
  await act("task_create", randomUUID(), {
    title: "Follow up",
    client_id: cid,
    project_id: id,
    due_at: null,
    owner_id: null,
  });
  const archive = (
    await db.query<any>("select id from crm_stages where outcome='archived'")
  ).rows[0].id;
  await act("deal_update", id, { ...data, stage_id: archive }, 1);
  await act("deal_update", id, data, 2);
  expect(
    (await db.query<any>("select status from projects where id=$1", [id]))
      .rows[0].status,
  ).toBe("active");
  expect(
    (await db.query<any>("select paused_at from crm_tasks")).rows[0].paused_at,
  ).not.toBeNull();
});
it("restricts historical imports and protects original source snapshots", async () => {
  expect(
    (await importProjects([history], randomUUID(), photographer)).error,
  ).toBe("Office access required.");
  const privileges = (
    await db.query<any>(
      "select has_function_privilege('authenticated','crm_import_honeybook_projects(uuid,uuid,jsonb)','execute') browser_rpc,has_table_privilege('anon','crm_honeybook_projects','select') anon_read",
    )
  ).rows[0];
  expect(privileges).toEqual({ browser_rpc: false, anon_read: false });
  await importProjects([history]);
  await expect(
    db.exec("update crm_honeybook_projects set original_stage='Changed'"),
  ).rejects.toThrow(/append-only/);
});
it("requires explicit project reopening rather than reclassifying an occupied archive stage", async () => {
  await importProjects([history]);
  const archive = (
    await db.query<any>("select id from crm_stages where outcome='archived'")
  ).rows[0].id;
  expect(
    (
      await act("stage_save", archive, {
        name: "Archived",
        position: 110,
        outcome: "open",
      })
    ).error,
  ).toMatch(/Move projects/);
  expect(
    (
      await act("stage_save", archive, {
        name: "History",
        position: 110,
        outcome: "archived",
      })
    ).error,
  ).toBeUndefined();
});

async function acquisition(
  action: string,
  id: string,
  data: object,
  version = 0,
  actor = admin,
) {
  return (
    await db.query<any>(
      "select crm_acquisition_action($1,$2,$3,$4,$5::jsonb) result",
      [actor, action, id, version, JSON.stringify(data)],
    )
  ).rows[0].result;
}
async function acquisitionFlow(approval = false) {
  const formId = await form(),
    message = randomUUID(),
    file = randomUUID(),
    sequence = randomUUID();
  expect(
    await acquisition("message_template_save", message, {
      name: "Reply",
      subject: "Hi {{first_name}}",
      body: "Received {{project_name}}",
      ready: true,
    }),
  ).toMatchObject({ version: 1 });
  const blocks = [
    {
      id: randomUUID(),
      kind: "text",
      title: "Brief",
      body: "Tell us about your project.",
    },
    {
      id: randomUUID(),
      kind: "question",
      field: { key: "goals", label: "Goals", type: "textarea", required: true },
    },
  ];
  expect(
    await acquisition("file_template_save", file, {
      name: "Brief",
      title: "Project brief",
      description: "",
      blocks,
      ready: true,
    }),
  ).toMatchObject({ version: 1 });
  const steps = [
    {
      id: randomUUID(),
      kind: "email",
      delay: 0,
      unit: "hours",
      message_template_id: message,
      file_template_id: file,
      task_title: "",
      requires_approval: approval,
    },
    {
      id: randomUUID(),
      kind: "task",
      delay: 2,
      unit: "business_days",
      task_title: "Follow up",
    },
  ];
  const settings = {
    name: "Flow",
    form_id: formId,
    enabled: true,
    timezone: "America/New_York",
    steps,
  };
  expect(await acquisition("sequence_save", sequence, settings)).toMatchObject({
    version: 1,
  });
  const submission = randomUUID();
  await submit(formId, submission);
  const job = (
    await db.query<any>(
      "select * from crm_acquisition_jobs where submission_id=$1",
      [submission],
    )
  ).rows[0];
  return { formId, message, file, sequence, settings, submission, job };
}
it("enrolls only new inquiries atomically, freezes content and deduplicates public retries", async () => {
  const f = await acquisitionFlow();
  await submit(f.formId, f.submission);
  expect(
    (
      await db.query(
        "select * from crm_acquisition_jobs where submission_id=$1",
        [f.submission],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query("select * from crm_tasks where project_id=$1", [
        f.job.project_id,
      ])
    ).rows,
  ).toHaveLength(1);
  await acquisition(
    "message_template_save",
    f.message,
    { name: "New", subject: "Changed", body: "Changed", ready: true },
    1,
  );
  expect(
    (
      await db.query<any>(
        "select subject from crm_acquisition_jobs where id=$1",
        [f.job.id],
      )
    ).rows[0].subject,
  ).toBe("Hi {{first_name}}");
});
it("computes business-day delays over weekends and DST in the configured timezone", async () => {
  const result = await db.query<any>(
    "select crm_due_at('2026-03-06 15:00:00Z',2,'business_days','America/New_York') result",
  );
  expect(new Date(result.rows[0].result).toISOString()).toBe(
    "2026-03-10T14:00:00.000Z",
  );
});
it("holds approval-required emails until an office actor approves them", async () => {
  const f = await acquisitionFlow(true);
  expect(
    (await db.query("select * from crm_claim_acquisition(5)")).rows,
  ).toHaveLength(0);
  expect(await acquisition("job_approve", f.job.id, {})).toMatchObject({
    id: f.job.id,
  });
  const jobs = (await db.query<any>("select * from crm_claim_acquisition(5)"))
    .rows;
  expect(jobs).toHaveLength(1);
  expect(
    (await db.query("select * from crm_claim_acquisition(5)")).rows,
  ).toHaveLength(0);
  const job = jobs[0];
  const prepared = (
    await db.query<any>("select crm_prepare_acquisition($1,$2,true) result", [
      job.id,
      job.lease_token,
    ])
  ).rows[0].result;
  expect(prepared.job.id).toBe(job.id);
  expect(prepared.file_token).toMatch(/^[a-f0-9]{64}$/);
  expect(
    (
      await db.query<any>(
        "select crm_finish_acquisition($1,$2,'accepted','provider1') result",
        [job.id, job.lease_token],
      )
    ).rows[0].result,
  ).toBe(true);
  expect(
    (
      await db.query<any>(
        "select crm_finish_acquisition($1,$2,'accepted','provider1') result",
        [job.id, job.lease_token],
      )
    ).rows[0].result,
  ).toBe(false);
});
it("blocks missing mail configuration and never labels an unsent email accepted", async () => {
  await acquisitionFlow();
  const job = (await db.query<any>("select * from crm_claim_acquisition(5)"))
    .rows[0];
  expect(
    (
      await db.query<any>(
        "select crm_prepare_acquisition($1,$2,false) result",
        [job.id, job.lease_token],
      )
    ).rows[0].result,
  ).toEqual({ skip: true });
  expect(
    (
      await db.query<any>(
        "select status,attempts from crm_acquisition_jobs where id=$1",
        [job.id],
      )
    ).rows[0],
  ).toEqual({ status: "blocked", attempts: 0 });
});
it("stops pending messages and pauses tasks when the project is archived, without reenrolling on reopen", async () => {
  const f = await acquisitionFlow();
  const archive = (
    await db.query<any>("select id from crm_stages where outcome='archived'")
  ).rows[0].id;
  const d = await deal(f.job.client_id);
  await act("deal_update", f.job.project_id, { ...d, stage_id: archive }, 1);
  expect(
    (
      await db.query<any>(
        "select status from crm_acquisition_jobs where id=$1",
        [f.job.id],
      )
    ).rows[0].status,
  ).toBe("cancelled");
  expect(
    (
      await db.query<any>(
        "select paused_at from crm_tasks where project_id=$1",
        [f.job.project_id],
      )
    ).rows[0].paused_at,
  ).toBeTruthy();
  await act("deal_update", f.job.project_id, d, 2);
  expect(
    (await db.query("select * from crm_claim_acquisition(5)")).rows,
  ).toHaveLength(0);
});
it("pauses workflows and honours a stop after claim but before provider dispatch", async () => {
  const f = await acquisitionFlow();
  const job = (await db.query<any>("select * from crm_claim_acquisition(5)"))
    .rows[0];
  await acquisition("project_pause", job.project_id, {
    reason: "Client replied.",
  });
  expect(
    (
      await db.query<any>("select crm_prepare_acquisition($1,$2,true) result", [
        job.id,
        job.lease_token,
      ])
    ).rows[0].result,
  ).toEqual({ skip: true });
  expect(
    (
      await db.query<any>(
        "select status from crm_acquisition_jobs where id=$1",
        [job.id],
      )
    ).rows[0].status,
  ).toBe("cancelled");
});
it("stops queued messages when a workflow is disabled", async () => {
  const f = await acquisitionFlow();
  await acquisition(
    "sequence_save",
    f.sequence,
    { ...f.settings, enabled: false },
    1,
  );
  expect(
    (
      await db.query<any>(
        "select status from crm_acquisition_jobs where id=$1",
        [f.job.id],
      )
    ).rows[0].status,
  ).toBe("cancelled");
});
it("keeps issued content immutable and records a client response only once", async () => {
  const f = await acquisitionFlow();
  const file = (
    await db.query<any>("select * from crm_issued_files where id=$1", [
      f.job.file_id,
    ])
  ).rows[0];
  await acquisition(
    "file_template_save",
    f.file,
    {
      name: "Changed",
      title: "Changed",
      description: "",
      blocks: [{ id: randomUUID(), kind: "text", title: "", body: "Changed" }],
      ready: true,
    },
    1,
  );
  expect(
    (
      await db.query<any>("select title from crm_issued_files where id=$1", [
        file.id,
      ])
    ).rows[0].title,
  ).toBe("Project brief");
  const rid = randomUUID();
  const respond = () =>
    db.query<any>(
      "select crm_file_event($1,'respond',$2,'hash','{\"goals\":\"Film\"}'::jsonb) result",
      [file.access_token, rid],
    );
  expect((await respond()).rows[0].result).toEqual({ ok: true });
  expect((await respond()).rows[0].result).toEqual({ ok: true });
  expect(
    (
      await db.query("select * from crm_file_responses where file_id=$1", [
        file.id,
      ])
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query<any>(
        "select status from crm_acquisition_jobs where id=$1",
        [f.job.id],
      )
    ).rows[0].status,
  ).toBe("cancelled");
});
it("revokes client-file links without removing response history", async () => {
  const f = await acquisitionFlow();
  const file = (
    await db.query<any>("select * from crm_issued_files where id=$1", [
      f.job.file_id,
    ])
  ).rows[0];
  await acquisition("file_revoke", file.id, {});
  expect(
    (
      await db.query<any>(
        "select crm_file_event($1,'view',$2,'','{}') result",
        [file.access_token, randomUUID()],
      )
    ).rows[0].result,
  ).toEqual({ error: "File unavailable." });
});
it("does not replay an ambiguous send after a worker interruption", async () => {
  await acquisitionFlow();
  const job = (await db.query<any>("select * from crm_claim_acquisition(5)"))
    .rows[0];
  await db.query("select crm_prepare_acquisition($1,$2,true)", [
    job.id,
    job.lease_token,
  ]);
  await db.query(
    "update crm_acquisition_jobs set locked_at=now()-interval '10 minutes' where id=$1",
    [job.id],
  );
  expect(
    (await db.query("select * from crm_claim_acquisition(5)")).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query<any>(
        "select status from crm_acquisition_jobs where id=$1",
        [job.id],
      )
    ).rows[0].status,
  ).toBe("needs_review");
});
it("rejects contractor mutations and denies anonymous access to files, responses and worker RPCs", async () => {
  expect(
    await acquisition(
      "project_pause",
      randomUUID(),
      { reason: "Wrong role" },
      0,
      photographer,
    ),
  ).toEqual({ error: "Office access required." });
  await db.exec("savepoint access_check;set local role anon");
  await expect(db.query("select * from crm_issued_files")).rejects.toThrow();
  await db.exec("rollback to access_check;set local role anon");
  await expect(db.query("select crm_claim_acquisition(5)")).rejects.toThrow();
  await db.exec("rollback to access_check");
});
it("issues a manual client file once and rejects a changed payload using the same request ID", async () => {
  const f = await acquisitionFlow();
  const request = randomUUID(),
    payload = {
      project_id: f.job.project_id,
      message_template_id: f.message,
      file_template_id: f.file,
    };
  const first = await acquisition("issue_file", request, payload);
  expect(first.file_id).toBeTruthy();
  expect(await acquisition("issue_file", request, payload)).toMatchObject({
    file_id: first.file_id,
  });
  expect(
    (
      await db.query("select * from crm_acquisition_jobs where id=$1", [
        request,
      ])
    ).rows,
  ).toHaveLength(1);
  expect(
    await acquisition("issue_file", request, {
      ...payload,
      message_template_id: randomUUID(),
    }),
  ).toEqual({ error: "Request ID already used." });
});
it("returns to a safe paused state when an active workflow template becomes a draft", async () => {
  const f = await acquisitionFlow();
  await acquisition(
    "message_template_save",
    f.message,
    { name: "Draft", subject: "Draft", body: "Draft", ready: false },
    1,
  );
  expect(
    (
      await db.query<any>(
        "select enabled,version from crm_sequences where id=$1",
        [f.sequence],
      )
    ).rows[0],
  ).toEqual({ enabled: false, version: 2 });
  expect(
    (
      await db.query<any>(
        "select status from crm_acquisition_jobs where id=$1",
        [f.job.id],
      )
    ).rows[0].status,
  ).toBe("cancelled");
});
it("allows retry of a blocked unsent email and refuses replay after an attempted send", async () => {
  await acquisitionFlow();
  let job = (await db.query<any>("select * from crm_claim_acquisition(5)"))
    .rows[0];
  await db.query("select crm_prepare_acquisition($1,$2,false)", [
    job.id,
    job.lease_token,
  ]);
  expect(await acquisition("job_retry", job.id, {})).toMatchObject({
    id: job.id,
  });
  job = (await db.query<any>("select * from crm_claim_acquisition(5)")).rows[0];
  await db.query("select crm_prepare_acquisition($1,$2,true)", [
    job.id,
    job.lease_token,
  ]);
  await db.query("select crm_finish_acquisition($1,$2,'needs_review',null)", [
    job.id,
    job.lease_token,
  ]);
  expect(await acquisition("job_retry", job.id, {})).toEqual({
    error: "Only an email with no previous send attempt can be retried.",
  });
});
it("rejects mutation of issued snapshots at the database boundary", async () => {
  const f = await acquisitionFlow();
  await db.exec("savepoint immutable_file");
  await expect(
    db.query("update crm_issued_files set snapshot='{}' where id=$1", [
      f.job.file_id,
    ]),
  ).rejects.toThrow("immutable");
  await db.exec("rollback to immutable_file");
});
it("rejects stale workflow edits and keeps expired or unrelated client tokens unavailable", async () => {
  const f = await acquisitionFlow();
  expect(
    await acquisition(
      "sequence_save",
      f.sequence,
      { ...f.settings, name: "Stale" },
      0,
    ),
  ).toEqual({ error: "Record changed. Reload before saving." });
  expect(
    (
      await db.query<any>(
        "select crm_file_event($1,'view',$2,'','{}') result",
        ["0".repeat(64), randomUUID()],
      )
    ).rows[0].result,
  ).toEqual({ error: "File unavailable." });
});
it("keeps migration starters inactive and never enrolls pre-existing history", async () => {
  expect(
    (await db.query("select * from crm_sequences where enabled")).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from crm_message_templates where ready")).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from crm_file_templates where ready")).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from crm_acquisition_jobs")).rows,
  ).toHaveLength(0);
});
it("keeps a queued email snapshot immutable at the database boundary", async () => {
  const f = await acquisitionFlow();
  await db.exec("savepoint immutable_mail");
  await expect(
    db.query("update crm_acquisition_jobs set body='Changed' where id=$1", [
      f.job.id,
    ]),
  ).rejects.toThrow("immutable");
  await db.exec("rollback to immutable_mail");
});
it("does not accept views or answers after a client link has expired", async () => {
  const f = await acquisitionFlow();
  const file = (
    await db.query<any>(
      "insert into crm_issued_files(template_id,project_id,client_id,title,snapshot,context,expires_at) select template_id,project_id,client_id,title,snapshot,context,now()-interval '1 day' from crm_issued_files where id=$1 returning access_token",
      [f.job.file_id],
    )
  ).rows[0];
  expect(
    (
      await db.query<any>(
        "select crm_file_event($1,'respond',$2,'hash','{}') result",
        [file.access_token, randomUUID()],
      )
    ).rows[0].result,
  ).toEqual({ error: "File unavailable." });
});
it("allows explicit client files on booked projects while stopping automated lead emails", async () => {
  const f = await acquisitionFlow();
  const data = await deal(f.job.client_id);
  const won = (
    await db.query<any>("select id from crm_stages where name='Retainer paid'")
  ).rows[0].id;
  const planning = (
    await db.query<any>("select id from crm_stages where name='Planning'")
  ).rows[0].id;
  await act("deal_update", f.job.project_id, { ...data, stage_id: won }, 1);
  expect(
    (
      await db.query<any>(
        "select status from crm_acquisition_jobs where id=$1",
        [f.job.id],
      )
    ).rows[0].status,
  ).toBe("cancelled");
  const request = randomUUID();
  expect(
    await acquisition("issue_file", request, {
      project_id: f.job.project_id,
      message_template_id: f.message,
      file_template_id: f.file,
    }),
  ).toMatchObject({ id: request });
  await act(
    "deal_update",
    f.job.project_id,
    { ...data, stage_id: planning },
    2,
  );
  const job = (await db.query<any>("select * from crm_claim_acquisition(5)"))
    .rows[0];
  expect(job.id).toBe(request);
  expect(
    (
      await db.query<any>("select crm_prepare_acquisition($1,$2,true) result", [
        job.id,
        job.lease_token,
      ])
    ).rows[0].result.job.id,
  ).toBe(request);
});
it("preserves explicit office file sends when a client responds to an earlier file", async () => {
  const f = await acquisitionFlow();
  const request = randomUUID();
  await acquisition("issue_file", request, {
    project_id: f.job.project_id,
    message_template_id: f.message,
    file_template_id: f.file,
  });
  const file = (
    await db.query<any>(
      "select access_token from crm_issued_files where id=$1",
      [f.job.file_id],
    )
  ).rows[0];
  await db.query(
    "select crm_file_event($1,'respond',$2,'hash','{\"goals\":\"Film\"}')",
    [file.access_token, randomUUID()],
  );
  expect(
    (
      await db.query<any>(
        "select status from crm_acquisition_jobs where id=$1",
        [f.job.id],
      )
    ).rows[0].status,
  ).toBe("cancelled");
  expect(
    (
      await db.query<any>(
        "select status from crm_acquisition_jobs where id=$1",
        [request],
      )
    ).rows[0].status,
  ).toBe("queued");
});
