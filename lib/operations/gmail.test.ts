import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/google-calendar/api", () => ({ getAccessToken: vi.fn() }));
import { createAdminClient } from "@/lib/supabase/server";
import { getAccessToken } from "@/lib/google-calendar/api";
import { buildConsentUrl } from "@/lib/google-calendar/oauth";
import { draftSchema, encodeDraft, GMAIL_DRAFT, GMAIL_READ, loadInbox, normalizeMessage, saveGmailDraft } from "./gmail";

const db = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
const draft = { to: "editor@example.com", subject: "Re: Café interior", body: "Thank you, José.\nPlease confirm the deadline." };
beforeEach(() => {
  vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("GMAIL_INTEGRATION_ENABLED", "true");
  vi.stubEnv("GMAIL_DRAFTS_ENABLED", "true");
  vi.mocked(createAdminClient).mockReturnValue({ from: () => db } as never);
  db.select.mockReturnValue(db); db.eq.mockReturnValue(db);
  db.maybeSingle.mockResolvedValue({ data: { is_active: true, scope: `${GMAIL_READ} ${GMAIL_DRAFT}`, account_email: "producer@example.com" }, error: null });
  vi.mocked(getAccessToken).mockResolvedValue("private-token");
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("requests Gmail only through explicit incremental consent", () => {
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client");
  expect(new URL(buildConsentUrl("nonce")).searchParams.get("scope")).not.toContain("gmail");
  expect(new URL(buildConsentUrl("nonce", true)).searchParams.get("scope")).not.toContain(GMAIL_DRAFT);
  expect(new URL(buildConsentUrl("nonce", true, true)).searchParams.get("scope")).toContain(GMAIL_DRAFT);
});
it("returns an honest disconnected state without making Gmail requests", async () => {
  db.maybeSingle.mockResolvedValue({ data: { is_active: true, scope: "calendar" }, error: null });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(await loadInbox("user-a")).toMatchObject({ status: "disconnected", canDraft: false, messages: [] });
  expect(fetcher).not.toHaveBeenCalled();
  expect(db.eq).toHaveBeenCalledWith("team_member_id", "user-a");
});
it("uses the account's reply-to header and does not treat unread as a required reply", () => {
  const message = normalizeMessage({ id: "a", threadId: "b", internalDate: "0", labelIds: ["UNREAD"], payload: { headers: [{ name: "From", value: "Sender <sender@example.com>" }, { name: "Reply-To", value: "Support <support@example.com>" }, { name: "Subject", value: "Schedule" }] } }, "producer@example.com");
  expect(message).toMatchObject({ replyTo: "support@example.com", unread: true, receivedAt: "" });
  expect(message.href).toContain("authuser=producer%40example.com");
});
it("preserves partial inbox results and reports failed messages and truncation", async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes("messages?")) return Response.json({ messages: [{ id: "a" }, { id: "b" }], nextPageToken: "more" });
    if (url.includes("messages/b?")) return new Response("private response", { status: 503 });
    return Response.json({ id: "a", threadId: "t", snippet: "Short preview", internalDate: "1000" });
  }); vi.stubGlobal("fetch", fetcher);
  const inbox = await loadInbox("user-a");
  expect(inbox.status).toBe("error"); expect(inbox.messages).toHaveLength(1);
  expect(inbox.message).toContain("Limited to the 20"); expect(inbox.message).toContain("1 messages could not");
  expect(inbox.message).not.toContain("private response");
});
it("rejects header injection and encodes Unicode email correctly", () => {
  expect(draftSchema.safeParse({ ...draft, to: "editor@example.com\r\nBcc: other@example.com" }).success).toBe(false);
  expect(draftSchema.safeParse({ ...draft, subject: "Hello\r\nBcc: other@example.com" }).success).toBe(false);
  const decoded = Buffer.from(encodeDraft(draft), "base64url").toString();
  expect(decoded).toContain(`Subject: =?UTF-8?B?${Buffer.from(draft.subject).toString("base64")}?=`);
  expect(Buffer.from(decoded.split("\r\n\r\n")[1], "base64").toString()).toBe(draft.body);
});
it("updates an existing draft without calling a send endpoint", async () => {
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ id: "existing-draft" })); vi.stubGlobal("fetch", fetcher);
  expect(await saveGmailDraft("user-a", { ...draft, draftId: "existing-draft" })).toMatchObject({ id: "existing-draft" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts/existing-draft");
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "PUT" });
});
it("does not write drafts without compose permission", async () => {
  db.maybeSingle.mockResolvedValue({ data: { is_active: true, scope: GMAIL_READ }, error: null });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(saveGmailDraft("user-a", draft)).rejects.toThrow("approve inbox and draft access");
  expect(fetcher).not.toHaveBeenCalled();
});

it("keeps Gmail disabled until the server explicitly enables it", async () => {
  vi.stubEnv("GMAIL_INTEGRATION_ENABLED", "false");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(await loadInbox("user-a")).toMatchObject({status:"disconnected",canDraft:false});
  expect(fetcher).not.toHaveBeenCalled();
});
