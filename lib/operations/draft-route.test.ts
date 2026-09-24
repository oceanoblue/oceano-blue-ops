import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/require-team-member", () => ({ requireTeamMember: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn(), createClient: vi.fn() }));
vi.mock("./gmail", async importOriginal => ({ ...await importOriginal<typeof import("./gmail")>(), saveGmailDraft: vi.fn() }));
import { requireTeamMember } from "@/lib/auth/require-team-member";
import { createAdminClient } from "@/lib/supabase/server";
import { saveGmailDraft } from "./gmail";
import { POST } from "@/app/api/operations/draft/route";
const rpc = vi.fn();
const payload = { to: "editor@example.com", subject: "Handoff", body: "Please confirm media access." };
const request = (origin = "https://app.example.com") => new Request("https://app.example.com/api/operations/draft?action=save", { method: "POST", headers: { origin }, body: JSON.stringify(payload) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireTeamMember).mockResolvedValue({ error: null, user: { id: "signed-in-user" } as never });
  vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
  rpc.mockResolvedValue({ data: 1, error: null });
  vi.mocked(saveGmailDraft).mockResolvedValue({ id: "draft", href: "https://mail.google.com/mail/#drafts" });
});
it("blocks non-staff before touching mailbox data", async () => {
  vi.mocked(requireTeamMember).mockResolvedValue({ error: new Response(null, { status: 403 }) as never, user: null });
  expect((await POST(request())).status).toBe(403); expect(rpc).not.toHaveBeenCalled(); expect(saveGmailDraft).not.toHaveBeenCalled();
});
it("blocks cross-origin writes", async () => {
  expect((await POST(request("https://other.example.com"))).status).toBe(403); expect(saveGmailDraft).not.toHaveBeenCalled();
});
it("fails closed when the durable limiter is unavailable", async () => {
  rpc.mockResolvedValue({ data: null, error: {} });
  expect((await POST(request())).status).toBe(503); expect(saveGmailDraft).not.toHaveBeenCalled();
});
it("limits repeated writes and uses the session user for mailbox ownership", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(saveGmailDraft).toHaveBeenCalledWith("signed-in-user", payload);
  rpc.mockResolvedValue({ data: 31, error: null });
  expect((await POST(request())).status).toBe(429); expect(saveGmailDraft).toHaveBeenCalledTimes(1);
});
