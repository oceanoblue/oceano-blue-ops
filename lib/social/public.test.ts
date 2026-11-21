import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A small in-memory stand-in for the database client: enough of its filter
 * chain to run the real signing, agreement and report code against rows.
 */
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
function fakeDb() {
  return {
    // Route tests delegate atomicity and concurrency to the PostgreSQL suite.
    rpc(name: string, args: Row) {
      if (name === "social_month_scope") {
        const accounts = tables.social_accounts ?? [];
        return {order: () => ({range:(from:number,to:number) => ({data:accounts.filter(a => a.program_id===args.p_program && a.is_active)
        .map(a => ({...a,account_id:a.id})).slice(from,to+1),error:null})})};
      }
      if (name !== "social_review_items") throw new Error(`Unexpected RPC ${name}`);
      const rows = args.p_items.map((x: Row) => tables.social_content_items.find(r => r.id === x.id && r.account_id === args.p_account && r.month === args.p_month));
      if (rows.some((r: Row) => !r)) return { error: { code: "P0002", message: "Unavailable." } };
      for (const r of rows) {
        if ((args.p_event === "approved" && r.status !== "client_review") || (args.p_event === "handled" && r.client_decision !== "changes"))
          return { error: { code: "P0001", message: "Refresh the piece." } };
      }
      for (const r of rows) {
        if (args.p_event === "approved") Object.assign(r, { status: "approved", client_decision: "approved", client_reviewer: args.p_name });
        if (args.p_event === "changes") Object.assign(r, { status: r.status === "client_review" ? "in_design" : r.status, client_decision: "changes", client_note: args.p_note, client_reviewer: args.p_name });
        if (args.p_event === "handled") Object.assign(r, { status: r.status === "approved" ? "client_review" : r.status, client_decision: "" });
      }
      return { data: rows.length, error: null };
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let range: [number,number] | null = null;
      let patch: Row | null = null;
      let inserted: Row | null = null;
      const match = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
      const run = () => {
        if (inserted) return { data: [inserted], error: null };
        const rows = match();
        if (patch) rows.forEach((r) => Object.assign(r, patch));
        return { data: (range ? rows.slice(range[0], range[1]+1) : rows).map((r) => ({ ...r })), error: null };
      };
      const b: any = {
        select: () => b,
        range: (from:number,to:number) => ((range=[from,to]),b),
        order: () => b,
        limit: () => b,
        eq: (c: string, v: unknown) => (filters.push((r) => c==="social_accounts.program_id" ? tables.social_accounts?.some(a=>a.id===r.account_id && a.program_id===v) : r[c] === v), b),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
        lte: (c: string, v: string) => (filters.push((r) => r[c] <= v), b),
        gte: (c: string, v: string) => (filters.push((r) => r[c] >= v), b),
        update: (p: Row) => ((patch = p), b),
        insert: (row: Row) => {
          const defaults = table === "social_agreements" ? { status: "draft" } : table === "social_client_notes" ? { status: "open" } : {};
          inserted = { id: `new-${(tables[table] ??= []).length + 1}`, ...defaults, updated_at: "t0", ...row };
          tables[table].push(inserted);
          return b;
        },
        maybeSingle: async () => {
          const { data } = run();
          return { data: data[0] ?? null, error: null };
        },
        single: async () => {
          const { data } = run();
          return { data: data[0] ?? null, error: null };
        },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
      };
      return b;
    },
  };
}
vi.mock("@/lib/crm/server", async () => ({
  ...(await vi.importActual<typeof import("@/lib/crm/server")>("@/lib/crm/server")),
  crmDb: () => fakeDb(),
}));

import { CLIENT_SIGNING_CONSENT, COUNTERSIGN_CONSENT } from "./schema";
import { auditItem } from "./audit";
import { clientAction, documentHash, listClientNotes, publicAgreement, publicReport, runAction, signAgreement } from "./server";

const client = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const ipHash = "b".repeat(64);
const sign = (hash: string) => ({ signer_name: "Pat Lee", signer_title: "VP", signer_email: "pat@example.com", consent: true as const, document_hash: hash });
const agreement = () => tables.social_agreements[0];

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  tables.social_programs = [{ id: client, name: "Test Hotels", onboarding: {}, report_token: null }];
  tables.social_agreements = [];
  tables.team_members = [];
});

describe("an agreement from draft to signed by both", () => {
  it("locks the text when sent, takes the client's signature once, then ours", async () => {
    const { id } = await runAction(actor, { action: "create_agreement", program_id: client, title: "Agreement", body: "# Terms\r\n\r\nText  \n" });
    expect(agreement()).toMatchObject({ body: "# Terms\n\nText", status: "draft", created_by: actor });

    // A draft has no link, so nothing can be opened or signed yet.
    expect(await publicAgreement("x".repeat(43))).toBeNull();

    const { token } = (await runAction(actor, { action: "send_agreement", id: id as string })) as { token: string };
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const hash = documentHash("Agreement", "# Terms\n\nText");
    expect(agreement()).toMatchObject({ status: "sent", token, document_hash: hash });

    // Once sent, the text cannot be edited or sent again.
    await expect(runAction(actor, { action: "update_agreement", id: id as string, title: "Changed", body: "Other" })).rejects.toMatchObject({ status: 409 });
    await expect(runAction(actor, { action: "send_agreement", id: id as string })).rejects.toMatchObject({ status: 409 });
    expect(agreement().title).toBe("Agreement");

    const shown = await publicAgreement(token);
    expect(shown).toMatchObject({ client: "Test Hotels", title: "Agreement", status: "sent", document_hash: hash });
    expect(shown).not.toHaveProperty("program_id");

    // We cannot countersign before the client signs.
    await expect(runAction(actor, { action: "countersign_agreement", id: id as string, signer_name: "Gus R", signer_title: "Founder", consent: true })).rejects.toMatchObject({ status: 409 });

    // A signature for different text than the signer saw is refused.
    await expect(signAgreement(token, sign("c".repeat(64)), ipHash)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("Reload") });
    expect(agreement().status).toBe("sent");

    expect(await signAgreement(token, sign(hash), ipHash)).toEqual({ title: "Agreement", client: "Test Hotels", program_id: client });
    expect(agreement()).toMatchObject({ status: "client_signed", client_name: "Pat Lee", client_email: "pat@example.com", client_consent: CLIENT_SIGNING_CONSENT, client_ip_hash: ipHash });

    // Signing twice is refused and changes nothing.
    await expect(signAgreement(token, { ...sign(hash), signer_name: "Someone Else" }, ipHash)).rejects.toMatchObject({ status: 409, message: "This agreement has already been signed." });
    expect(agreement().client_name).toBe("Pat Lee");

    await runAction(actor, { action: "countersign_agreement", id: id as string, signer_name: "Gus R", signer_title: "Founder", consent: true });
    expect(agreement()).toMatchObject({ status: "signed", counter_name: "Gus R", counter_consent: COUNTERSIGN_CONSENT, countersigned_by: actor });
    // The database checklist trigger is exercised in the PostgreSQL-backed intake workflow suite.

    // A fully signed agreement cannot be cancelled, and its link shows both signatures.
    await expect(runAction(actor, { action: "void_agreement", id: id as string })).rejects.toMatchObject({ status: 409 });
    expect(await publicAgreement(token)).toMatchObject({ status: "signed", client_name: "Pat Lee", counter_name: "Gus R" });
  });

  it("stops a cancelled agreement's link from opening or being signed", async () => {
    const { id } = await runAction(actor, { action: "create_agreement", program_id: client, title: "Agreement", body: "Text" });
    const { token } = (await runAction(actor, { action: "send_agreement", id: id as string })) as { token: string };
    await runAction(actor, { action: "void_agreement", id: id as string });
    expect(await publicAgreement(token)).toBeNull();
    await expect(signAgreement(token, sign(documentHash("Agreement", "Text")), ipHash)).rejects.toMatchObject({ status: 404 });
    await expect(signAgreement("not a token", sign("a".repeat(64)), ipHash)).rejects.toMatchObject({ status: 404 });
    expect(agreement().status).toBe("void");
  });
});

describe("logos", () => {
  it("shares one sub-account's logo with others of the same client only, and removes a logo", async () => {
    tables.social_accounts = [
      { id: "a1", program_id: client, name: "Courtyard One", logo_url: "https://x.test/social-logos/c.png" },
      { id: "a2", program_id: client, name: "Courtyard Two", logo_url: "" },
      { id: "a3", program_id: "other-client", name: "Courtyard Elsewhere", logo_url: "" },
      { id: "a4", program_id: client, name: "No Logo", logo_url: "" },
    ];
    const one = "33333333-3333-4333-8333-333333333331";
    const ids = { a1: one, a2: one.replace(/1$/, "2"), a3: one.replace(/1$/, "3"), a4: one.replace(/1$/, "4") };
    for (const row of tables.social_accounts) row.id = ids[row.id as keyof typeof ids];
    expect(await runAction(actor, { action: "share_logo", account_id: ids.a1, to: [ids.a2, ids.a3] })).toEqual({ updated: 1 });
    expect(tables.social_accounts.map((r) => r.logo_url)).toEqual(["https://x.test/social-logos/c.png", "https://x.test/social-logos/c.png", "", ""]);
    // A sub-account with no logo has nothing to share.
    await expect(runAction(actor, { action: "share_logo", account_id: ids.a4, to: [ids.a2] })).rejects.toMatchObject({ status: 400 });
    await runAction(actor, { action: "remove_logo", target: "account", id: ids.a2 });
    expect(tables.social_accounts[1].logo_url).toBe("");
    tables.social_programs[0].logo_url = "https://x.test/social-logos/n.png";
    await runAction(actor, { action: "remove_logo", target: "client", id: client });
    expect(tables.social_programs[0].logo_url).toBe("");
    await expect(runAction(actor, { action: "remove_logo", target: "client", id: ids.a4 })).rejects.toMatchObject({ status: 404 });
  });
});

describe("the client report link", () => {
  const account = { id: "a1", program_id: client, name: "Hotel A", tier: "standard", platforms: ["facebook"], posts_per_month: 2, reels_per_month: 1, google_posts_per_month: 0, is_active: true, access_status: "issue", access_note: "password changed", voice_notes: "secret voice" };
  const piece = (over: Row) => ({ account_id: "a1", month: "2027-01-01", kind: "post", slot: 1, pillar: "flexible", title: "Lobby", caption: "Draft caption", status: "planned", scheduled_for: "2027-01-10", assignee: actor, design_url: "https://www.canva.com/d/1", published_url: "", review_note: "internal: redo this", ...over });

  it("is off until created, changes when replaced, and stops working when switched off", async () => {
    expect(await publicReport("x".repeat(43), "2027-01")).toBeNull();
    const { token: first } = (await runAction(actor, { action: "set_report_link", id: client, enabled: true })) as { token: string };
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await publicReport(first, "2027-01"))?.client).toBe("Test Hotels");
    const { token: second } = (await runAction(actor, { action: "set_report_link", id: client, enabled: true })) as { token: string };
    expect(second).not.toBe(first);
    expect(await publicReport(first, "2027-01")).toBeNull();
    expect(await runAction(actor, { action: "set_report_link", id: client, enabled: false })).toEqual({ token: null });
    expect(await publicReport(second, "2027-01")).toBeNull();
    expect(await publicReport("../../etc/passwd", "2027-01")).toBeNull();
  });

  it("shows a client their month without drafts, staff notes, access details or fees", async () => {
    const { token } = (await runAction(actor, { action: "set_report_link", id: client, enabled: true })) as { token: string };
    tables.social_accounts = [account, { ...account, id: "a2", name: "Paused Hotel", is_active: false }];
    tables.social_content_items = [
      piece({ id: "i1", status: "in_design" }),
      piece({ id: "i2", slot: 2, status: "client_review", caption: "Ready caption" }),
      piece({ id: "i3", slot: 3, status: "published", caption: "Live caption", published_url: "https://www.facebook.com/p/1" }),
    ];
    tables.social_media_batches = [];
    tables.social_media_requests = [{ id: "r1", account_id: "a1", ask: "Pool photos", due_on: "2027-01-15", status: "sent", created_at: "2027-01-01" }];

    const report = (await publicReport(token, "2027-01"))!;
    expect(report.totals).toEqual({ owed: 3, fulfilled: 1, in_progress: 1, for_review: 1, approved: 0, scheduled: 0, live: 1 });
    expect(report.accounts.map((a) => a.name)).toEqual(["Hotel A"]);
    const [inProgress, review, live] = report.accounts[0].pieces;
    // A piece still being made shows its title and date only.
    expect(inProgress).toMatchObject({ stage: "in_progress", title: "Lobby", caption: "", design_url: "", published_url: "" });
    expect(review).toMatchObject({ stage: "for_review", caption: "Ready caption", design_url: "https://www.canva.com/d/1", published_url: "" });
    expect(live).toMatchObject({ stage: "live", caption: "Live caption", published_url: "https://www.facebook.com/p/1" });
    expect(report.accounts[0]).toMatchObject({ media: "out", requests: [{ ask: "Pool photos", due_on: "2027-01-15" }] });

    const text = JSON.stringify(report);
    // A piece still being made carries no id, so nothing can be sent about it.
    expect(inProgress.id).toBe("");
    expect(review.id).toBe("i2");
    for (const secret of ["internal: redo this", "password changed", "secret voice", actor, "Draft caption", "review_note", "assignee", "access", "fee_cents", "monthly_fee", token])
      expect(text).not.toContain(secret);
  });
});

describe("what a client can do from their page", () => {
  const other = "99999999-9999-4999-8999-999999999999";
  const ids = {
    hotel: "44444444-4444-4444-8444-444444444401",
    paused: "44444444-4444-4444-8444-444444444402",
    theirs: "44444444-4444-4444-8444-444444444403",
    review: "55555555-5555-4555-8555-555555555501",
    review2: "55555555-5555-4555-8555-555555555502",
    nextMonth: "55555555-5555-4555-8555-555555555503",
    making: "55555555-5555-4555-8555-555555555504",
    approved: "55555555-5555-4555-8555-555555555505",
    live: "55555555-5555-4555-8555-555555555506",
    foreign: "55555555-5555-4555-8555-555555555507",
    onPaused: "55555555-5555-4555-8555-555555555508",
  };
  const piece = (id: string, status: string, over: Row = {}) => ({ id, account_id: ids.hotel, month: "2027-01-01", kind: "post", slot: 1, title: "Lobby", caption: "Caption", status, scheduled_for: "2027-01-10", assignee: null, design_url: "", client_decision: "", client_note: "", client_reviewer: "", client_reviewed_at: null, ...over });
  const row = (id: string) => tables.social_content_items.find((r) => r.id === id)!;
  let token = "";

  beforeEach(async () => {
    tables.social_programs.push({ id: other, name: "Another Client", onboarding: {}, report_token: "o".repeat(43) });
    tables.social_accounts = [
      { id: ids.hotel, program_id: client, name: "Hotel A", is_active: true },
      { id: ids.paused, program_id: client, name: "Paused Hotel", is_active: false },
      { id: ids.theirs, program_id: other, name: "Their Hotel", is_active: true },
    ];
    tables.social_content_items = [
      piece(ids.review, "client_review"),
      piece(ids.review2, "client_review", { slot: 2 }),
      piece(ids.nextMonth, "client_review", { month: "2027-02-01" }),
      piece(ids.making, "in_design"),
      piece(ids.approved, "approved"),
      piece(ids.live, "published"),
      piece(ids.foreign, "client_review", { account_id: ids.theirs }),
      piece(ids.onPaused, "client_review", { account_id: ids.paused }),
    ];
    tables.social_client_notes = [];
    token = ((await runAction(actor, { action: "set_report_link", id: client, enabled: true })) as { token: string }).token;
  });

  it("approves a piece that is waiting for review, once, and records who said so", async () => {
    expect(await clientAction(token, { action: "approve", revision: 1, item_id: ids.review, name: "Pat Lee" })).toMatchObject({ approved: 1, notify: null, client: "Test Hotels" });
    expect(row(ids.review)).toMatchObject({ status: "approved", client_decision: "approved", client_reviewer: "Pat Lee" });
    await expect(clientAction(token, { action: "approve", revision: 1, item_id: ids.review, name: "Pat Lee" })).rejects.toMatchObject({ status: 409 });
  });

  it("treats another client's piece, a paused sub-account's piece and an unseen piece as not found, and changes nothing", async () => {
    for (const item_id of [ids.foreign, ids.onPaused, ids.making, "55555555-5555-4555-8555-5555555555ff"]) {
      await expect(clientAction(token, { action: "approve", revision: 1, item_id, name: "Pat Lee" })).rejects.toMatchObject({ status: 404 });
      await expect(clientAction(token, { action: "request_changes", revision: 1, item_id, name: "Pat Lee", note: "Change it" })).rejects.toMatchObject({ status: 404 });
    }
    expect(row(ids.foreign)).toMatchObject({ status: "client_review", client_decision: "" });
    expect(row(ids.onPaused).status).toBe("client_review");
    expect(row(ids.making)).toMatchObject({ status: "in_design", client_note: "" });
    // The other client's link cannot reach this client's pieces either.
    await expect(clientAction("o".repeat(43), { action: "approve", revision: 1, item_id: ids.review, name: "Mallory" })).rejects.toMatchObject({ status: 404 });
    expect(row(ids.review).status).toBe("client_review");
    await expect(clientAction("not-a-link", { action: "approve", revision: 1, item_id: ids.review, name: "Pat Lee" })).rejects.toMatchObject({ status: 404 });
    await expect(clientAction("z".repeat(43), { action: "approve", revision: 1, item_id: ids.review, name: "Pat Lee" })).rejects.toMatchObject({ status: 404 });
  });

  it("sends a piece under review back to design when changes are asked for, and tells the office", async () => {
    const result = await clientAction(token, { action: "request_changes", revision: 1, item_id: ids.review, name: "Pat Lee", note: "Use the pool photo" });
    expect(result.notify).toEqual({ kind: "changes", by: "Pat Lee", account: "Hotel A", title: "Lobby", text: "Use the pool photo" });
    expect(row(ids.review)).toMatchObject({ status: "in_design", client_decision: "changes", client_note: "Use the pool photo", client_reviewer: "Pat Lee" });
    const report = await publicReport(token, "2027-01");
    const receipt = report?.accounts[0].pieces.find(piece => piece.feedback?.note === "Use the pool photo");
    expect(receipt).toMatchObject({
      stage: "in_progress", feedback: { decision: "changes", by: "Pat Lee", note: "Use the pool photo" },
      id: "", caption: "", creative_url: "", design_url: "", destinations: [],
    });
    // The open client concern remains visible when the office returns the piece for review.
    await runAction(actor, { action: "update_item", id: ids.review, patch: { status: "client_review" } });
    expect(row(ids.review)).toMatchObject({ status: "client_review", client_decision: "changes", client_note: "Use the pool photo" });
  });

  it("keeps an approved or live piece where it is when a change is asked for, and holds it until the office deals with it", async () => {
    await clientAction(token, { action: "request_changes", revision: 1, item_id: ids.approved, name: "Pat Lee", note: "Wrong date" });
    await clientAction(token, { action: "request_changes", revision: 1, item_id: ids.live, name: "Pat Lee", note: "Typo in the caption" });
    expect(row(ids.approved)).toMatchObject({ status: "approved", client_decision: "changes" });
    expect(row(ids.live)).toMatchObject({ status: "published", client_decision: "changes" });
    const issues = auditItem({ ...row(ids.approved), design_url: "https://www.canva.com/d/1" } as never, { id: ids.hotel, platforms: ["facebook"], avoid_terms: [] }, { today: "2027-01-05", programAvoid: [], repeated: false });
    expect(issues).toContainEqual(expect.objectContaining({ code: "client_changes", severity: "error", message: expect.stringContaining("Wrong date") }));
    await runAction(actor, { action: "resolve_client_feedback", revision: 1, id: ids.approved });
    expect(row(ids.approved)).toMatchObject({ status: "client_review", client_decision: "" });
    await expect(runAction(actor, { action: "resolve_client_feedback", revision: 1, id: ids.approved })).rejects.toMatchObject({ status: 409 });
  });

  it("approves everything waiting for one sub-account in the month on screen, and nothing else", async () => {
    expect((await clientAction(token, { action: "approve_all", items: [ids.review, ids.review2].map(id => ({ id, revision: 1 })), account_id: ids.hotel, month: "2027-01", name: "Pat Lee" })).approved).toBe(2);
    expect([ids.review, ids.review2].map((id) => row(id).status)).toEqual(["approved", "approved"]);
    expect(row(ids.nextMonth).status).toBe("client_review");
    expect(row(ids.making).status).toBe("in_design");
    expect(row(ids.foreign).status).toBe("client_review");
    await expect(clientAction(token, { action: "approve_all", items: [ids.review, ids.review2].map(id => ({ id, revision: 1 })), account_id: ids.theirs, month: "2027-01", name: "Pat Lee" })).rejects.toMatchObject({ status: 404 });
    await expect(clientAction(token, { action: "approve_all", items: [ids.review, ids.review2].map(id => ({ id, revision: 1 })), account_id: ids.paused, month: "2027-01", name: "Pat Lee" })).rejects.toMatchObject({ status: 404 });
    expect(row(ids.onPaused).status).toBe("client_review");
  });

  it("files a note under the client's own account, and the office can mark it done", async () => {
    const result = await clientAction(token, { action: "note", account_id: ids.hotel, name: "Pat Lee", message: "Live music every Friday" });
    expect(result.notify).toEqual({ kind: "note", by: "Pat Lee", account: "Hotel A", title: "", text: "Live music every Friday" });
    await clientAction(token, { action: "note", account_id: null, name: "Pat Lee", message: "A general question" });
    await expect(clientAction(token, { action: "note", account_id: ids.theirs, name: "Pat Lee", message: "Sneaky" })).rejects.toMatchObject({ status: 404 });
    expect(tables.social_client_notes.map((n) => [n.program_id, n.account_id, n.message])).toEqual([
      [client, ids.hotel, "Live music every Friday"],
      [client, null, "A general question"],
    ]);
    expect(await listClientNotes(other)).toEqual([]);
    const [first] = await listClientNotes(client);
    await runAction(actor, { action: "resolve_client_note", id: tables.social_client_notes[0].id = "66666666-6666-4666-8666-666666666601" });
    expect(tables.social_client_notes[0]).toMatchObject({ status: "done", resolved_by: actor });
    expect((await listClientNotes(client)).map((n) => n.message)).toEqual(["A general question"]);
    expect(first).toBeDefined();
  });

  it("shows the client their own answers on the page, and never another client's pieces", async () => {
    await clientAction(token, { action: "request_changes", revision: 1, item_id: ids.approved, name: "Pat Lee", note: "Wrong date" });
    const report = (await publicReport(token, "2027-01"))!;
    expect(report.accounts.map((a) => a.name)).toEqual(["Hotel A"]);
    const shown = report.accounts[0].pieces.find((p) => p.id === ids.approved)!;
    expect(shown.feedback).toMatchObject({ decision: "changes", note: "Wrong date", by: "Pat Lee" });
    expect(JSON.stringify(report)).not.toContain(ids.foreign);
    expect(JSON.stringify(report)).not.toContain("Their Hotel");
  });
});
