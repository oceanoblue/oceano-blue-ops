import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ sign: vi.fn(), rpc: vi.fn(), send: vi.fn(), digest: vi.fn() }));
vi.mock("@/lib/crm/server", async () => ({
  ...(await vi.importActual<typeof import("@/lib/crm/server")>("@/lib/crm/server")),
  crmDb: () => ({ rpc: mock.rpc }),
}));
vi.mock("@/lib/email/resend", () => ({ sendEmail: mock.send, defaultReplyTo: () => "office@example.test" }));
vi.mock("./server", () => ({ signAgreement: mock.sign, listPrograms: vi.fn(), loadWorkspace: vi.fn() }));

import { POST as signPost } from "@/app/api/social-public/agreements/[token]/route";
import { CrmError } from "@/lib/crm/server";
import { digestEmail, digestSection } from "./digest";
import { accountHref, agreementHref, clientHref, reportHref } from "./links";
import { actionSchema, agreementBlocks, clientStage, initials, sameBrand, signSchema, signatureTime, STATUSES } from "./schema";
import type { Account, Item, MediaBatch, MediaRequest, Program } from "./server";
import { accountRows, clientMonth, healthCounts, platformCounts, rhythm } from "./summary";

const origin = "https://app.oceanoblue.net";
const id = "11111111-1111-4111-8111-111111111111";
const hash = "a".repeat(64);
const token = "t".repeat(43);

const program = (over: Partial<Program> = {}): Program => ({
  id,
  name: "Test Hotels",
  contact_name: "",
  contact_email: "",
  publishing_tool: "",
  status: "active",
  notes: "",
  monthly_fee_cents: 0,
  account_rate_cents: 0,
  minimum_fee_cents: 0,
  term_start: null,
  term_months: 0,
  media_due_day: null,
  agreement_url: "",
  onboarding: {},
  avoid_terms: [],
  report_token: null,
  logo_url: "",
  ...over,
});
const account = (name: string, over: Partial<Account> = {}): Account => ({
  id: randomUUID(),
  program_id: id,
  name,
  tier: "standard",
  platforms: ["facebook", "instagram"],
  posts_per_month: 2,
  reels_per_month: 1,
  google_posts_per_month: 0,
  profile_links: {},
  brand_kit_url: "",
  media_folder_url: "",
  voice_notes: "",
  access_status: "connected",
  access_note: "",
  is_active: true,
  avoid_terms: [],
  logo_url: "",
  ...over,
});
let slot = 0;
const item = (a: Account, over: Partial<Item> = {}): Item => ({
  id: randomUUID(),
  account_id: a.id,
  month: "2027-01-01",
  kind: "post",
  slot: ++slot,
  pillar: "property_feature",
  title: "Lobby refresh",
  caption: "",
  status: "planned",
  scheduled_for: "2027-01-20",
  assignee: null,
  design_url: "",
  published_url: "",
  review_note: "",
  updated_at: "2027-01-01T00:00:00Z",
  ...over,
});
const media = (a: Account, photos: number, videos: number): MediaBatch => ({
  id: randomUUID(),
  account_id: a.id,
  received_on: "2027-01-02",
  source: "property",
  photos,
  videos,
  link: "",
  note: "",
});
const request = (a: Account, due_on: string | null): MediaRequest => ({ id: randomUUID(), account_id: a.id, ask: "Pool photos", due_on, status: "sent", created_at: "2027-01-01T00:00:00Z" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("links", () => {
  it("gives every client its own pages and keeps the month", () => {
    expect(clientHref("dashboard", id)).toBe(`/dashboard/social/clients/${id}`);
    expect(clientHref("accounts", id, "2027-01")).toBe(`/dashboard/social/clients/${id}/accounts?month=2027-01`);
    expect(clientHref("agreement", id)).toBe(`/dashboard/social/clients/${id}/agreement`);
    expect(accountHref(id, "2027-02")).toBe(`/dashboard/social/accounts/${id}?month=2027-02`);
    expect(reportHref(token, "2027-01")).toBe(`/social/report/${token}?month=2027-01`);
    expect(agreementHref(token)).toBe(`/social/agreement/${token}`);
  });
});

describe("a client's month at a glance", () => {
  it("counts each sub-account's progress, problems and media, and leaves paused sub-accounts out", () => {
    const a = account("Hotel A");
    const b = account("Hotel B", { access_status: "issue" });
    const paused = account("Hotel C", { is_active: false });
    const items = [
      item(a, { status: "published", caption: "Hello", design_url: "https://www.canva.com/d/1" }),
      item(a, { status: "scheduled", caption: "Hello again", design_url: "https://www.canva.com/d/2" }),
      // Approved with no caption: fails a check and is held back.
      item(a, { status: "approved", kind: "reel", caption: "" }),
      // Planned for a date that has passed: late.
      item(b, { status: "in_design", scheduled_for: "2027-01-05" }),
      item(b, { status: "client_review", caption: "For review", design_url: "https://www.canva.com/d/3" }),
    ];
    const { rows, summary } = clientMonth(program({ onboarding: { accounts_loaded: "2026-11-20" } }), { accounts: [a, b, paused], items, media: [media(a, 40, 9)], requests: [request(b, "2027-01-08")] }, "2027-01-15");
    expect(rows.map((r) => r.account.name)).toEqual(["Hotel A", "Hotel B"]);
    expect(rows[0]).toMatchObject({ planned: 3, owed: 3, done: 2, late: 0, errors: 1, health: "good" });
    expect(rows[1]).toMatchObject({ planned: 2, owed: 3, done: 0, late: 1, health: "out" });
    expect(rows[1].requests).toHaveLength(1);
    expect(summary).toMatchObject({
      accounts: 2,
      owed: 6,
      planned: 5,
      done: 2,
      inProduction: 1,
      withClient: 1,
      approved: 1,
      late: 1,
      held: 1,
      outOfMedia: 1,
      lowOnMedia: 0,
      accessProblems: 1,
      openRequests: 1,
      onboardingDone: 1,
      onboardingTotal: 12,
      percentDone: 33,
    });
    expect(summary.errors).toBeGreaterThanOrEqual(1);
  });
  it("is all zeros for a client with nothing yet", () => {
    const { rows, summary } = clientMonth(program(), { accounts: [], items: [], media: [], requests: [] }, "2027-01-15");
    expect(rows).toEqual([]);
    expect(summary).toMatchObject({ accounts: 0, owed: 0, planned: 0, percentDone: 0, errors: 0 });
  });
});

describe("logos and chart numbers", () => {
  it("makes initials for a tile with no logo yet", () => {
    expect(initials("Newport Hospitality Group")).toBe("NH");
    expect(initials("Hampton Inn Jacksonville Beach/Oceanfront")).toBe("HJ");
    expect(initials("Sleep Inn & Suites Clintwood")).toBe("SC");
    expect(initials("Nunzio")).toBe("NU");
    expect(initials("  ")).toBe("?");
  });
  it("finds the other sub-accounts of the same brand by their first word", () => {
    const list = ["Courtyard Somerset", "Courtyard West Orange", "courtyard Lowercase", "Home2 Suites Brunswick", "Homewood Suites Columbus Easton"].map((name, i) => ({ id: String(i), name }));
    expect(sameBrand(list[0], list)).toEqual({ brand: "Courtyard", others: [list[1], list[2]] });
    expect(sameBrand(list[3], list).others).toEqual([]);
  });
  it("counts pieces by planned date, leaving out undated pieces and other months", () => {
    const a = account("Hotel A");
    const days = rhythm(
      [
        item(a, { status: "published", scheduled_for: "2027-02-03" }),
        item(a, { status: "scheduled", scheduled_for: "2027-02-03" }),
        item(a, { status: "in_design", scheduled_for: "2027-02-03" }),
        item(a, { status: "planned", scheduled_for: "2027-02-28" }),
        item(a, { status: "planned", scheduled_for: null }),
        item(a, { status: "planned", scheduled_for: "2027-03-01" }),
      ],
      "2027-02",
    );
    expect(days).toHaveLength(28);
    expect(days[2]).toEqual({ day: 3, label: "Feb 3", done: 2, open: 1 });
    expect(days[27]).toEqual({ day: 28, label: "Feb 28", done: 0, open: 1 });
    expect(days.reduce((n, d) => n + d.done + d.open, 0)).toBe(4);
  });
  it("counts sub-accounts by platform, media supply and access", () => {
    const a = account("Hotel A", { platforms: ["facebook", "instagram", "google"] });
    const b = account("Hotel B", { platforms: ["facebook"], access_status: "issue" });
    const c = account("Hotel C", { platforms: [], access_status: "pending" });
    const rows = accountRows({ accounts: [a, b, c], items: [], media: [media(a, 40, 9)], requests: [] }, {}, "2027-01-15");
    expect(platformCounts(rows)).toEqual([
      { label: "Facebook", value: 2 },
      { label: "Instagram", value: 1 },
      { label: "Google", value: 1 },
    ]);
    expect(healthCounts(rows)).toEqual({ media: { good: 1, low: 0, out: 2 }, access: { connected: 1, pending: 1, issue: 1 } });
  });
});

describe("daily digest", () => {
  const a = account("Hotel A");
  const b = account("Hotel B", { access_status: "pending" });
  const empty = { accounts: [a, b], items: [], media: [media(a, 40, 9), media(b, 40, 9)], requests: [] };

  it("says nothing when an active client is on track", () => {
    const ok = account("Hotel OK");
    const data = { accounts: [ok], items: [item(ok, { status: "scheduled", caption: "Hi", design_url: "https://www.canva.com/d/1" })], media: [media(ok, 40, 9)], requests: [] };
    expect(digestSection(program(), { month: "2027-01", data }, { month: "2027-02", data: { ...data, items: [] } }, "2027-01-12")).toBeNull();
  });
  it("lists failed checks, late pieces, short media, access and overdue requests for an active client", () => {
    const current = {
      accounts: [a, b],
      items: [item(a, { status: "approved", caption: "" }), item(b, { status: "in_design", scheduled_for: "2027-01-03" })],
      media: [media(a, 40, 9)],
      requests: [request(b, "2027-01-05"), request(a, "2027-02-01")],
    };
    const section = digestSection(program(), { month: "2027-01", data: current }, { month: "2027-02", data: empty }, "2027-01-12");
    const text = section!.lines.map((l) => l.text).join("\n");
    expect(section!.client).toBe("Test Hotels");
    expect(text).toMatch(/fails? a check in January 2027/);
    expect(text).toContain("1 approved piece is held back from scheduling in January 2027");
    expect(text).toContain("1 piece is past the planned date");
    expect(text).toContain("1 sub-account is out of recent media");
    expect(text).toContain("1 sub-account does not have confirmed access");
    expect(text).toContain("1 media request is past the date we asked for");
    expect(text).not.toContain("not fully planned");
    expect(section!.lines.find((l) => l.text.includes("out of recent media"))!.names).toEqual(["Hotel B"]);
  });
  it("warns from the 20th when next month is not fully planned", () => {
    const text = (today: string) => digestSection(program(), { month: "2027-01", data: empty }, { month: "2027-02", data: empty }, today)!.lines.map((l) => l.text).join("\n");
    expect(text("2027-01-19")).not.toContain("not fully planned");
    expect(text("2027-01-20")).toContain("February 2027 is not fully planned: 0 of 6 pieces are on the plan.");
  });
  it("reminds about onboarding once a week, on Monday, and leaves paused and ended clients alone", () => {
    const onboarding = program({ status: "onboarding", onboarding: { agreement_signed: "2026-12-01" } });
    // 2026-11-23 is a Monday; 2026-11-24 a Tuesday.
    const monday = digestSection(onboarding, { month: "2026-11", data: empty }, { month: "2026-12", data: empty }, "2026-11-23");
    expect(monday!.lines[0].text).toBe("Onboarding: 1 of 12 steps done. Next: First invoice sent.");
    expect(digestSection(onboarding, { month: "2026-11", data: empty }, { month: "2026-12", data: empty }, "2026-11-24")).toBeNull();
    for (const status of ["paused", "ended", "prospect"] as const)
      expect(digestSection(program({ status }), { month: "2026-11", data: empty }, { month: "2026-12", data: empty }, "2026-11-23")).toBeNull();
  });
  it("writes one email, escapes names, and trims long lists", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const { subject, html } = digestEmail([{ client: "Fish & <Chips>", clientId: id, lines: [{ text: "8 sub-accounts are out of recent media.", names }] }], "2027-01-12");
    expect(subject).toBe("Social media: 1 item to look at for Fish & <Chips>");
    expect(html).toContain("Fish &amp; &lt;Chips&gt;");
    expect(html).not.toContain("<Chips>");
    expect(html).toContain("A, B, C, D, E, F and 2 more");
    expect(html).toContain(`/dashboard/social/clients/${id}`);
  });
});

describe("agreements", () => {
  it("splits agreement text into headings and paragraphs", () => {
    expect(agreementBlocks("# Agreement\r\n\r\n## 1. Parties\nLine one\nLine two\n\n\nNext paragraph\n##Not a heading")).toEqual([
      { type: "h1", text: "Agreement" },
      { type: "h2", text: "1. Parties" },
      { type: "p", text: "Line one\nLine two" },
      { type: "p", text: "Next paragraph\n##Not a heading" },
    ]);
    expect(agreementBlocks("")).toEqual([]);
  });
  it("prints when a signature was made, with the time zone named", () => {
    expect(signatureTime("2026-11-23T19:10:00Z")).toBe("November 23, 2026 at 2:10:00 PM EST");
    expect(signatureTime("2027-07-01T16:00:00Z")).toBe("July 1, 2027 at 12:00:00 PM EDT");
    expect(signatureTime(null)).toBe("");
    expect(signatureTime("not a date")).toBe("");
  });
  it("shows a client only how far along a piece is, never our internal stages", () => {
    expect(STATUSES.map(clientStage)).toEqual(["in_progress", "in_progress", "in_progress", "in_progress", "for_review", "approved", "scheduled", "live"]);
  });
  it("accepts a signature only with a name, an email, the consent box and the text's fingerprint", () => {
    const good = { signer_name: " Pat Lee ", signer_title: "VP", signer_email: "Pat@Example.com", consent: true, document_hash: hash };
    expect(signSchema.parse(good)).toMatchObject({ signer_name: "Pat Lee", signer_email: "pat@example.com" });
    expect(signSchema.safeParse({ ...good, consent: false }).success).toBe(false);
    expect(signSchema.safeParse({ ...good, signer_name: "P" }).success).toBe(false);
    expect(signSchema.safeParse({ ...good, signer_email: "nope" }).success).toBe(false);
    expect(signSchema.safeParse({ ...good, document_hash: "abc" }).success).toBe(false);
  });
  it("validates the office's agreement and report-link requests", () => {
    expect(actionSchema.safeParse({ action: "create_agreement", program_id: id, title: "Agreement", body: "# Terms\n\nText" }).success).toBe(true);
    expect(actionSchema.safeParse({ action: "create_agreement", program_id: id, title: "Agreement", body: "   \n " }).success).toBe(false);
    expect(actionSchema.safeParse({ action: "create_agreement", program_id: id, title: "", body: "Text" }).success).toBe(false);
    expect(actionSchema.safeParse({ action: "countersign_agreement", id, signer_name: "Gus R", consent: true }).success).toBe(true);
    expect(actionSchema.safeParse({ action: "countersign_agreement", id, signer_name: "Gus R", consent: false }).success).toBe(false);
    expect(actionSchema.safeParse({ action: "set_report_link", id, enabled: true }).success).toBe(true);
    expect(actionSchema.safeParse({ action: "set_report_link", id }).success).toBe(false);
    expect(actionSchema.safeParse({ action: "remove_logo", target: "client", id }).success).toBe(true);
    expect(actionSchema.safeParse({ action: "remove_logo", target: "team", id }).success).toBe(false);
    expect(actionSchema.safeParse({ action: "share_logo", account_id: id, to: [id] }).success).toBe(true);
    expect(actionSchema.safeParse({ action: "share_logo", account_id: id, to: [] }).success).toBe(false);
  });
});

describe("signing page API", () => {
  const good = { signer_name: "Pat Lee", signer_title: "VP", signer_email: "pat@example.com", consent: true, document_hash: hash };
  const sign = (body: unknown, from = origin) =>
    signPost(
      new Request(`${origin}/api/social-public/agreements/${token}`, {
        method: "POST",
        headers: { origin: from, "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ token }) },
    );
  beforeEach(() => {
    mock.rpc.mockResolvedValue({ data: 1, error: null });
    mock.sign.mockResolvedValue({ title: "Agreement", client: "Test Hotels", program_id: id });
    mock.send.mockResolvedValue({ status: "sent", id: "e1" });
  });

  it("saves a valid signature with a hashed address, then tells the office", async () => {
    const res = await sign(good);
    expect(res.status).toBe(200);
    expect(mock.sign).toHaveBeenCalledWith(token, expect.objectContaining({ signer_name: "Pat Lee", document_hash: hash }), expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(mock.sign.mock.calls[0][2]).not.toContain("203.0.113.9");
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ to: "office@example.test", subject: "Test Hotels signed: Agreement" }));
  });
  it("still succeeds when the office email fails, because the signature is already saved", async () => {
    mock.send.mockRejectedValue(new Error("mail down"));
    expect((await sign(good)).status).toBe(200);
  });
  it("refuses previews, other sites, bad forms and too many attempts, and saves nothing", async () => {
    expect((await sign(good, "https://evil.test")).status).toBe(403);
    expect((await sign({ ...good, consent: false })).status).toBe(400);
    mock.rpc.mockResolvedValue({ data: 11, error: null });
    expect((await sign(good)).status).toBe(429);
    mock.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect((await sign(good)).status).toBe(503);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await sign(good)).status).toBe(403);
    expect(mock.sign).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("passes on why a signature was refused", async () => {
    mock.sign.mockRejectedValue(new CrmError("This agreement has already been signed.", 409));
    const res = await sign(good);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "This agreement has already been signed." });
    expect(mock.send).not.toHaveBeenCalled();
  });
});

describe("database", () => {
  let db: PGlite;
  const office = randomUUID();
  const field = randomUUID();
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      create table team_members(id uuid primary key, full_name text, role text, is_active boolean);
      grant select on team_members to authenticated, service_role;
      insert into team_members values ('${office}','Office','admin',true), ('${field}','Field','photographer',true);`);
    for (const file of ["20261118130000_social_studio.sql", "20261120160000_social_studio_programs.sql", "20261120190000_social_studio_clients.sql", "20261120200000_social_studio_logos.sql"])
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }, 60000);
  afterAll(async () => await db?.close());
  const rows = async (sql: string, args: unknown[] = []) => (await db.query<any>(sql, args)).rows;

  it("never holds a signature without the locked text it applies to", async () => {
    const [{ id: client }] = await rows("insert into social_programs(name) values('Signing Co') returning id");
    const [{ id: agreement }] = await rows("insert into social_agreements(program_id,title,body) values($1,'Agreement','Text') returning id", [client]);
    // Cannot be sent without a link secret, a fingerprint and a sent time.
    await expect(rows("update social_agreements set status='sent' where id=$1", [agreement])).rejects.toThrow();
    await rows("update social_agreements set status='sent', token=$2, document_hash=$3, sent_at=now() where id=$1", [agreement, token, hash]);
    // Cannot be marked signed by the client without a name and a time.
    await expect(rows("update social_agreements set status='client_signed' where id=$1", [agreement])).rejects.toThrow();
    await rows("update social_agreements set status='client_signed', client_name='Pat Lee', client_signed_at=now() where id=$1", [agreement]);
    // Cannot be complete without our countersignature.
    await expect(rows("update social_agreements set status='signed' where id=$1", [agreement])).rejects.toThrow();
    await rows("update social_agreements set status='signed', counter_name='Gus R', countersigned_at=now() where id=$1", [agreement]);
    await expect(rows("update social_agreements set status='archived' where id=$1", [agreement])).rejects.toThrow();
    await expect(rows("update social_agreements set document_hash='nope' where id=$1", [agreement])).rejects.toThrow();
  });
  it("keeps link secrets unique and long enough to be unguessable", async () => {
    const [{ id: one }] = await rows("insert into social_programs(name,report_token) values('Report One',$1) returning id", [token]);
    await expect(rows("insert into social_programs(name,report_token) values('Report Two',$1)", [token])).rejects.toThrow();
    await expect(rows("update social_programs set report_token='short' where id=$1", [one])).rejects.toThrow();
    await rows("update social_programs set report_token=null where id=$1", [one]);
    const [{ id: draft }] = await rows("insert into social_agreements(program_id,title,body) values($1,'Second','Text') returning id", [one]);
    await expect(rows("update social_agreements set status='sent', token=$2, document_hash=$3, sent_at=now() where id=$1", [draft, token, hash])).rejects.toThrow();
  });
  it("stores a logo link on clients and sub-accounts, blank by default", async () => {
    const [{ id: client, logo_url }] = await rows("insert into social_programs(name) values('Logo Co') returning id, logo_url");
    expect(logo_url).toBe("");
    const [sub] = await rows("insert into social_accounts(program_id,name,logo_url) values($1,'Hotel Logo','https://example.test/social-logos/a.png') returning logo_url", [client]);
    expect(sub.logo_url).toBe("https://example.test/social-logos/a.png");
    await expect(rows("update social_programs set logo_url=$2 where id=$1", [client, "x".repeat(501)])).rejects.toThrow();
  });
  it("lets office staff read agreements, hides them from field staff and the public, and lets nobody write from the browser", async () => {
    const as = async (role: string, who: string | null, sql: string) => {
      await db.exec(`begin; set local role ${role}; select set_config('request.jwt.claim.sub','${who ?? ""}',true);`);
      try {
        return (await db.query<any>(sql)).rows;
      } finally {
        await db.exec("rollback");
      }
    };
    expect((await as("authenticated", office, "select title from social_agreements")).length).toBeGreaterThan(0);
    expect(await as("authenticated", field, "select title from social_agreements")).toHaveLength(0);
    await expect(as("anon", null, "select title from social_agreements")).rejects.toThrow();
    await expect(as("authenticated", office, "update social_agreements set status='void'")).rejects.toThrow();
    await expect(as("authenticated", office, "insert into social_agreements(program_id,title,body) select id,'x','y' from social_programs limit 1")).rejects.toThrow();
  });
});
