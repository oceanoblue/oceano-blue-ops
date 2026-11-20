import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A small in-memory stand-in for the database client: enough of its filter
 * chain to run the real signing, agreement and report code against rows.
 */
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
function fakeDb() {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Row | null = null;
      let inserted: Row | null = null;
      const match = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
      const run = () => {
        if (inserted) return { data: [inserted], error: null };
        const rows = match();
        if (patch) rows.forEach((r) => Object.assign(r, patch));
        return { data: rows.map((r) => ({ ...r })), error: null };
      };
      const b: any = {
        select: () => b,
        order: () => b,
        limit: () => b,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
        gte: (c: string, v: string) => (filters.push((r) => r[c] >= v), b),
        update: (p: Row) => ((patch = p), b),
        insert: (row: Row) => {
          inserted = { id: `new-${(tables[table] ??= []).length + 1}`, status: "draft", updated_at: "t0", ...row };
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
import { documentHash, publicAgreement, publicReport, runAction, signAgreement } from "./server";

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
    // The onboarding step is ticked for the client.
    expect(tables.social_programs[0].onboarding.agreement_signed).toMatch(/^\d{4}-\d{2}-\d{2}$/);

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
    expect(report.totals).toEqual({ owed: 3, in_progress: 1, for_review: 1, approved: 0, scheduled: 0, live: 1 });
    expect(report.accounts.map((a) => a.name)).toEqual(["Hotel A"]);
    const [inProgress, review, live] = report.accounts[0].pieces;
    // A piece still being made shows its title and date only.
    expect(inProgress).toMatchObject({ stage: "in_progress", title: "Lobby", caption: "", design_url: "", published_url: "" });
    expect(review).toMatchObject({ stage: "for_review", caption: "Ready caption", design_url: "https://www.canva.com/d/1", published_url: "" });
    expect(live).toMatchObject({ stage: "live", caption: "Live caption", published_url: "https://www.facebook.com/p/1" });
    expect(report.accounts[0]).toMatchObject({ media: "out", requests: [{ ask: "Pool photos", due_on: "2027-01-15" }] });

    const text = JSON.stringify(report);
    for (const secret of ["internal: redo this", "password changed", "secret voice", actor, "Draft caption", "review_note", "assignee", "access", "fee", token])
      expect(text).not.toContain(secret);
  });
});
