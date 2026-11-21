import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("transactional social authorization and delivery with synthetic accounts", () => {
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
    for (const f of ["20261118130000_social_studio","20261120160000_social_studio_programs","20261120190000_social_studio_clients","20261120200000_social_studio_logos","20261120210000_social_studio_client_side","20261121110000_social_monthly_scope","20261121111000_social_review_delivery","20261121130000_social_delivery_service_window"]) {
      await db.exec(readFileSync(`supabase/migrations/${f}.sql`, "utf8"));
    }
  }, 60000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    office = randomUUID(); program = randomUUID(); account = randomUUID();
    await db.exec("truncate social_programs,team_members cascade");
    await query("insert into team_members values($1,'Office Test','admin',true)", [office]);
    await query("insert into social_programs(id,name,status,approval_mode,publishing_enabled,report_token) values($1,'Synthetic client','active','batch',true,$2)", [program, token]);
    await query("insert into social_accounts(id,name,program_id,platforms,access_status,posts_per_month,publishing_timezone,provider_destinations) values($1,'Synthetic property',$2,'{facebook,instagram}','connected',12,'America/New_York',$3)",
      [account, program, JSON.stringify({ facebook: "test-fb", instagram: "test-ig" })]);
  });
  it("approves only the frozen revisions on screen, atomically, and keeps earlier concerns", async () => {
    const a = await makePiece(1), b = await makePiece(2), later = await makePiece(3);
    await query("update social_content_items set caption='A newer version' where id=$1", [b]);
    await expect(review([{ id:a,revision:1 },{ id:b,revision:1 }])).rejects.toThrow(/changed/);
    expect((await state(a)).status).toBe("client_review");
    await review([{id:a,revision:1},{id:b,revision:2}]);
    expect((await state(later)).status).toBe("client_review");
    await query("update social_content_items set review_note='Private edit' where id=$1", [b]);
    expect((await state(b)).approved_revision).toBe(2);
    await query("update social_content_items set creative_path='versions/test/second' where id=$1", [b]);
    expect(await state(b)).toMatchObject({ status:"client_review", review_revision:3, approved_revision:null });
    await review([{id:b,revision:3}],"client","changes");
    const changed = await state(b);
    expect(changed).toMatchObject({status:"in_design",client_decision:"changes"});
    await review([{id:b,revision:changed.review_revision}],"office","handled");
    const events = await query("select event,note,snapshot from social_review_events where item_id=$1 order by created_at", [b]);
    expect(events.map(x=>x.event)).toEqual(["approved","changes","handled"]);
    expect(events[0].snapshot.creative_path).toBe("versions/test/file");
    expect(events[1].note).toBe("Use a different photo");
  });
  it("gates an office-led program, expiry, lifecycle and access, and keeps dry runs side-effect free", async () => {
    await query("update social_programs set approval_mode='office',publishing_enabled=false where id=$1",[program]);
    const id = await makePiece(1);
    await expect(review([{id,revision:1}])).rejects.toThrow(/reviewer/);
    await review([{id,revision:1}],"office");
    expect(await claim(id,"facebook",true)).toMatchObject({mode:"test",dispatch:false});
    expect(await query("select id from social_deliveries")).toHaveLength(0);
    await expect(claim(id,"facebook")).rejects.toThrow(/changed/);
    await query("update social_programs set publishing_enabled=true,status='paused' where id=$1",[program]);
    await expect(claim(id,"facebook")).rejects.toThrow(/changed/);
    await query("update social_programs set status='active' where id=$1",[program]);
    await query("update social_accounts set access_status='pending' where id=$1",[account]);
    await expect(claim(id,"facebook")).rejects.toThrow(/changed/);
    await query("update social_accounts set access_status='connected',posts_per_month=0 where id=$1",[account]);
    await expect(claim(id,"facebook")).rejects.toThrow(/scope/);
  });
  it("holds a post dated before the service start even if its month has an entitlement", async () => {
    await query("update social_programs set term_start='2099-01-15',term_months=1 where id=$1",[program]);
    const id = await makePiece(1);
    await review([{id,revision:1}]);
    await expect(claim(id,"facebook")).rejects.toThrow(/service window/);
  });
  it("claims once per destination, reconciles ambiguous responses, and advances only on all receipts", async () => {
    const id = await makePiece(1);
    await review([{id,revision:1}]);
    const fb = await claim(id,"facebook");
    expect(fb).toMatchObject({ dispatch:true,destination:"test-fb" });
    expect(new Date(fb.publish_at).toISOString()).toBe("2099-01-01T15:30:00.000Z");
    await expect(claim(id,"facebook")).rejects.toThrow(/claimed/);
    await receipt(fb,"published","post-fb");
    expect(await receipt(fb,"published","post-fb")).toMatchObject({changed:false});
    expect((await state(id)).status).toBe("approved");
    const ig = await claim(id,"instagram");
    await receipt(ig,"uncertain","","Network timeout");
    await expect(claim(id,"instagram")).rejects.toThrow(/claimed/);
    await receipt(ig,"failed","","Verified absent by provider lookup");
    const retry = await claim(id,"instagram");
    expect(retry.idempotency_key).toBe(ig.idempotency_key);
    expect(retry.claim_id).not.toBe(ig.claim_id);
    await expect(receipt(ig,"published","old")).rejects.toThrow(/claim/);
    await receipt(retry,"scheduled","post-ig");
    expect((await state(id)).status).toBe("scheduled");
    await receipt(retry,"published","post-ig");
    expect((await state(id)).status).toBe("published");
    expect(await query("select id from social_deliveries")).toHaveLength(2);
    expect((await query("select state from social_delivery_events where delivery_id=$1 order by created_at", [retry.idempotency_key])).map(r => r.state))
      .toEqual(["claimed","uncertain","failed","claimed","scheduled","published"]);
  });
  it("keeps late provider evidence on the original revision without releasing a newer draft", async () => {
    const id = await makePiece(1);
    await review([{id,revision:1}]);
    const first = await claim(id,"facebook");
    await query("update social_content_items set caption='Revised' where id=$1",[id]);
    await receipt(first,"published","original-at-provider");
    expect(await state(id)).toMatchObject({status:"client_review",approved_revision:null});
    await review([{id,revision:2}]);
    await expect(claim(id,"facebook",false,2)).rejects.toThrow(/previous revision/);
    await query("update social_accounts set provider_destinations='{}' where id=$1",[account]);
    expect(await state(id)).toMatchObject({status:"client_review",approved_revision:null,review_revision:3});
  });
});
