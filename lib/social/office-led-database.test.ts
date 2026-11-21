import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("office-led clients and publishing recorded by hand, with synthetic accounts", () => {
  let db: PGlite;
  let office: string, program: string, account: string;
  const month = "2099-01-01";
  const token = "t".repeat(43);
  const query = async (sql: string, args: unknown[] = []) => (await db.query<Record<string, any>>(sql, args)).rows;
  const makePiece = async (slot: number) => (await query(
    "insert into social_content_items(account_id,month,kind,slot,pillar,title,caption,status,scheduled_for,publish_time,creative_path,creative_type) values($1,$2,'post',$3,'property_feature','Pool',$4,'client_review',$2,'10:30','versions/test/file','image/png') returning id",
    [account, month, slot, `Draft ${slot}`]))[0].id as string;
  const review = async (items: { id: string; revision: number }[], role = "client", event = "approved") =>
    query("select social_review_items($1,$2,$3,$4,$5,'Reviewer',$6,$7,$8,$9) as n",
      [program, account, month, JSON.stringify(items), role, role === "office" ? office : null, event, event === "changes" ? "Use a different photo" : "", role === "client" ? token : null]);
  const state = async (id: string) => (await query("select * from social_content_items where id=$1", [id]))[0];
  const claim = async (id: string, platform: string, dry = false, revision = 1) => (await query(
    "select social_claim_delivery(p.id,$2,$3,$4,a.updated_at,p.updated_at,$5) as d from social_programs p join social_accounts a on a.program_id=p.id where p.id=$1",
    [program, id, revision, platform, dry]))[0].d;
  const receipt = async (d: { idempotency_key: string; claim_id: string }, event: string, provider = "", detail = "") => (await query(
    "select social_record_receipt($1,$2,$3,$4,'',$5) as result", [d.idempotency_key, d.claim_id, event, provider, detail]))[0].result;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create table team_members(id uuid primary key,full_name text,role text,is_active boolean);
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    for (const f of ["20261118130000_social_studio","20261120160000_social_studio_programs","20261120190000_social_studio_clients","20261120200000_social_studio_logos","20261120210000_social_studio_client_side","20261121110000_social_monthly_scope","20261121111000_social_review_delivery","20261121130000_social_delivery_service_window","20261121150000_social_office_led_publishing"]) {
      await db.exec(readFileSync(`supabase/migrations/${f}.sql`, "utf8"));
    }
  }, 60000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    office = randomUUID(); program = randomUUID(); account = randomUUID();
    await db.exec("truncate social_programs,team_members cascade");
    await query("insert into team_members values($1,'Office Test','admin',true)", [office]);
    await query("insert into social_programs(id,name,status,approval_mode,publishing_enabled,report_token) values($1,'Synthetic client','active','office',false,$2)", [program, token]);
    await query("insert into social_accounts(id,name,program_id,platforms,access_status,posts_per_month,publishing_timezone,provider_destinations) values($1,'Synthetic property',$2,'{facebook,instagram}','connected',12,'America/New_York',$3)",
      [account, program, JSON.stringify({ facebook: "test-fb", instagram: "test-ig" })]);
  });
  const mark = async (items: { id: string; revision: number }[], event: string, url = "", actor = office) =>
    (await query("select social_mark_delivered($1,$2,$3,$4,$5,'Office Test') as n", [program, JSON.stringify(items), event, url, actor]))[0].n as number;
  const draft = async (slot: number) => (await query(
    "insert into social_content_items(account_id,month,kind,slot,pillar,title,caption,status,scheduled_for) values($1,$2,'post',$3,'property_feature','Pool',$4,'internal_review',$2) returning id",
    [account, month, slot, `Caption ${slot}`]))[0].id as string;

  it("lets the office authorize a piece that has no uploaded file, but still asks a client for one", async () => {
    const id = await draft(1);
    await review([{ id, revision: 1 }], "office");
    expect(await state(id)).toMatchObject({ status: "approved", approved_revision: 1, approved_by_role: "office", creative_path: null });
    // A piece with no caption or no date is still refused.
    const empty = await draft(2);
    await query("update social_content_items set caption='' where id=$1", [empty]);
    await expect(review([{ id: empty, revision: (await state(empty)).review_revision }], "office")).rejects.toThrow(/caption and the publish date/);
    // A client approval needs the frozen creative, as before.
    await query("update social_programs set approval_mode='individual' where id=$1", [program]);
    const forClient = await draft(3);
    await query("update social_content_items set status='client_review' where id=$1", [forClient]);
    await expect(review([{ id: forClient, revision: (await state(forClient)).review_revision }], "client")).rejects.toThrow(/frozen creative/);
  });

  it("marks authorized pieces scheduled and live by hand, in bulk, and records who did it", async () => {
    const a = await draft(1), b = await draft(2), waiting = await draft(3);
    await review([{ id: a, revision: 1 }], "office");
    await review([{ id: b, revision: 1 }], "office");
    // A piece that is not authorized stops the whole request, so nothing is half done.
    await expect(mark([{ id: a, revision: 1 }, { id: waiting, revision: 1 }], "scheduled")).rejects.toThrow(/Authorize/);
    expect((await state(a)).status).toBe("approved");
    expect(await mark([{ id: a, revision: 1 }, { id: b, revision: 1 }], "scheduled")).toBe(2);
    expect((await state(b)).status).toBe("scheduled");
    expect(await mark([{ id: a, revision: 1 }], "published", "https://example.com/p/1")).toBe(1);
    expect(await state(a)).toMatchObject({ status: "published", published_url: "https://example.com/p/1", approved_revision: 1 });
    // Straight from authorized to live is allowed too.
    const c = await draft(4);
    await review([{ id: c, revision: 1 }], "office");
    await mark([{ id: c, revision: 1 }], "published");
    expect((await state(c)).status).toBe("published");
    const events = await query("select event,actor_name,actor_id,snapshot from social_review_events where item_id=$1 order by created_at", [a]);
    expect(events.map((e) => e.event)).toEqual(["approved", "scheduled", "published"]);
    expect(events[2]).toMatchObject({ actor_name: "Office Test", actor_id: office });
    expect(events[2].snapshot).toMatchObject({ by_hand: true, published_url: "https://example.com/p/1" });
  });

  it("refuses a stale version, a link that is not https, a link for several pieces, and anyone who is not office staff", async () => {
    const a = await draft(1), b = await draft(2);
    await review([{ id: a, revision: 1 }], "office");
    await review([{ id: b, revision: 1 }], "office");
    await expect(mark([{ id: a, revision: 2 }], "scheduled")).rejects.toThrow(/changed/);
    await expect(mark([{ id: a, revision: 1 }], "published", "http://example.com/p")).rejects.toThrow(/Reload/);
    await expect(mark([{ id: a, revision: 1 }, { id: b, revision: 1 }], "published", "https://example.com/p")).rejects.toThrow(/Reload/);
    await expect(mark([{ id: a, revision: 1 }, { id: a, revision: 1 }], "scheduled")).rejects.toThrow(/Reload/);
    await expect(mark([{ id: a, revision: 1 }], "archived")).rejects.toThrow(/Reload/);
    const outsider = randomUUID();
    await query("insert into team_members values($1,'Field','photographer',true)", [outsider]);
    await expect(mark([{ id: a, revision: 1 }], "scheduled", "", outsider)).rejects.toThrow(/office staff/);
    // A piece of another client is "not found", never marked.
    const other = randomUUID(), otherAccount = randomUUID();
    await query("insert into social_programs(id,name,status,approval_mode) values($1,'Another client','active','office')", [other]);
    await query("insert into social_accounts(id,name,program_id,platforms,posts_per_month) values($1,'Other property',$2,'{facebook}',5)", [otherAccount, other]);
    await expect(query("select social_mark_delivered($1,$2,'scheduled','',$3,'Office Test')", [other, JSON.stringify([{ id: a, revision: 1 }]), office])).rejects.toThrow(/unavailable/);
    expect((await state(a)).status).toBe("approved");
  });

  it("reopens a piece marked by mistake, and a later edit asks for authorization again", async () => {
    const id = await draft(1);
    await review([{ id, revision: 1 }], "office");
    await mark([{ id, revision: 1 }], "published", "https://example.com/p/9");
    // A scheduled or live piece cannot be edited or moved back by an ordinary save.
    await expect(query("update social_content_items set caption='New words' where id=$1", [id])).rejects.toThrow(/publisher/);
    await expect(query("update social_content_items set status='in_design' where id=$1", [id])).rejects.toThrow(/Reconcile/);
    expect(await mark([{ id, revision: 1 }], "reopened")).toBe(1);
    expect(await state(id)).toMatchObject({ status: "approved", published_url: "", approved_revision: 1 });
    // The bypass does not outlive the reopen.
    await mark([{ id, revision: 1 }], "scheduled");
    await expect(query("update social_content_items set status='in_design' where id=$1", [id])).rejects.toThrow(/Reconcile/);
    await mark([{ id, revision: 1 }], "reopened");
    await query("update social_content_items set caption='New words' where id=$1", [id]);
    expect(await state(id)).toMatchObject({ status: "client_review", review_revision: 2, approved_revision: null });
    await expect(mark([{ id, revision: 2 }], "scheduled")).rejects.toThrow(/Authorize/);
    await expect(mark([{ id, revision: 2 }], "reopened")).rejects.toThrow(/Only a scheduled or live piece/);
  });

  it("holds a piece the client asked to change, and stays out of the way of automated publishing", async () => {
    const id = await draft(1);
    await review([{ id, revision: 1 }], "office");
    await review([{ id, revision: 1 }], "client", "changes");
    await expect(mark([{ id, revision: (await state(id)).review_revision }], "scheduled")).rejects.toThrow(/Authorize/);
    // A client on automated publishing is never marked by hand.
    const auto = await draft(2);
    await review([{ id: auto, revision: 1 }], "office");
    await query("update social_programs set publishing_enabled=true where id=$1", [program]);
    await expect(mark([{ id: auto, revision: 1 }], "scheduled")).rejects.toThrow(/connected publisher/);
    // Nor is a piece the bridge has already claimed, even after the switch is turned off.
    await query("update social_content_items set publish_time='10:30',creative_path='versions/test/x',creative_type='image/jpeg' where id=$1", [auto]);
    const current = (await state(auto)).review_revision;
    await review([{ id: auto, revision: current }], "office");
    await claim(auto, "facebook", false, current);
    await query("update social_programs set publishing_enabled=false where id=$1", [program]);
    await expect(mark([{ id: auto, revision: current }], "scheduled")).rejects.toThrow(/already handled/);
    await query("update social_programs set status='paused' where id=$1", [program]);
    await expect(mark([{ id, revision: 1 }], "scheduled")).rejects.toThrow(/unavailable/);
  });

  it("is closed to everyone but the server", async () => {
    const rows = await query(`select has_function_privilege('anon','public.social_mark_delivered(uuid,jsonb,text,text,uuid,text)','execute') as anon,
      has_function_privilege('authenticated','public.social_mark_delivered(uuid,jsonb,text,text,uuid,text)','execute') as authed,
      has_function_privilege('service_role','public.social_mark_delivered(uuid,jsonb,text,text,uuid,text)','execute') as service`);
    expect(rows[0]).toEqual({ anon: false, authed: false, service: true });
  });
});
