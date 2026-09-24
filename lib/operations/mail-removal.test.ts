import { afterEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => auth);
import { GET } from "@/app/api/auth/google/connect/route";
import { POST } from "@/app/api/operations/draft/route";
import { generateAgent } from "./providers";
import type { OperationsSnapshot } from "./types";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("keeps calendar consent and state protection without requesting mailbox access", async () => {
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "test-client");
  const builder = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { is_active: true, role: "photographer" } }) };
  auth.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "member" } } }) }, from: vi.fn().mockReturnValue(builder) });
  const response = await GET(new Request("https://ops.example/api/auth/google/connect"));
  expect(response.status).toBe(307);
  const consent = new URL(response.headers.get("location")!);
  expect(consent.searchParams.get("scope")?.split(" ")).toEqual([
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
  ]);
  expect(consent.searchParams.get("include_granted_scopes")).toBe("false");
  expect(consent.searchParams.get("state")).toMatch(/^member\.[a-f0-9]{64}$/);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
});
it("rejects old mailbox links and draft requests without network or credential access", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  for (const query of ["gmail=1", "gmail=1&drafts=1", "drafts=1"]) {
    expect((await GET(new Request(`https://ops.example/api/auth/google/connect?${query}`))).status).toBe(410);
  }
  expect((await POST()).status).toBe(410);
  expect(fetcher).not.toHaveBeenCalled();
  expect(auth.createClient).not.toHaveBeenCalled();
});
it("excludes legacy inbox data from model requests", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: "Plan" }] }] }));
  vi.stubGlobal("fetch", fetcher);
  const snapshot = { capturedAt: "2026-09-24T12:00:00Z", day: "2026-09-24", timezone: "UTC", calendar: { status: "connected", message: "Ready" }, events: [], items: [], conflicts: [], warnings: [], inbox: { messages: [{ snippet: "private-old-mail" }] } } as OperationsSnapshot;
  await generateAgent("planner", { provider: "openai", model: "test-model" }, snapshot);
  const input = JSON.parse(JSON.parse(fetcher.mock.calls[0][1].body).input);
  expect(input).not.toHaveProperty("inbox");
  expect(input.calendar.status).toBe("connected");
});
