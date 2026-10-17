import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn(), from: vi.fn(), read: vi.fn() }));
vi.mock("./server", async () => ({ ...(await vi.importActual<typeof import("./server")>("./server")), crmActor: mock.actor, crmDb: () => ({ rpc: mock.rpc, from: mock.from }) }));
vi.mock("./migration-server", () => ({ migrationRead: mock.read }));
import { GET, POST } from "@/app/api/crm/migration/route";
import { CrmError } from "./server";
import { observationSchema, factText } from "./migration-types";
const actor = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const source = { source_system: "honeybook", source_kind: "project", source_id: "source-project", source_url: "https://app.honeybook.com/projects/source", title: "Wedding", observed_at: "2026-10-17T12:00:00Z", project_date: "2027-01-07", facts: { balance: "Not verified" }, flags: ["payment_review_needed"] };
const payload = { action: "import", id, data: { records: [source] } };
const req = (body: unknown = payload, origin = "https://ops.example") => new Request("https://ops.example/api/crm/migration", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("VERCEL_ENV", "production"); mock.actor.mockResolvedValue(actor); mock.rpc.mockResolvedValue({ data: { id, imported: 1, skipped: 0 }, error: null }); mock.read.mockResolvedValue({ observations: [], counts: { total: 0 }, total: 0 }); });
afterEach(() => vi.unstubAllEnvs());
it("requires active office access before reading source evidence or mutating migration records", async () => {
  mock.actor.mockRejectedValue(new CrmError("Office access required.", 403));
  expect((await GET(new Request("https://ops.example/api/crm/migration"))).status).toBe(403);
  expect((await POST(req())).status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.read).not.toHaveBeenCalled();
});
it("uses the session actor, bounded source schemas, same-origin JSON and no-store responses", async () => {
  const r = await POST(req({ ...payload, actor: id }));
  expect(r.status).toBe(200); expect(r.headers.get("Cache-Control")).toContain("no-store");
  expect(mock.rpc).toHaveBeenCalledWith("crm_migration_action", expect.objectContaining({ p_actor: actor, p_action: "import", p_id: id }));
  mock.rpc.mockClear();
  expect((await POST(req(payload, "https://evil.example"))).status).toBe(403); expect(mock.rpc).not.toHaveBeenCalled();
});
it.each(["import", "review"])("keeps preview %s read-only even with a valid office session", async action => {
  vi.stubEnv("VERCEL_ENV", "preview");
  const data = action === "import" ? payload.data : { review_state: "active", priority: "urgent", next_action: "Review", owner_id: actor, follow_up_at: null, linked_ops_project: null, reason: "Verified source" };
  expect((await POST(req({ action, id, version: 1, data }))).status).toBe(403); expect(mock.rpc).not.toHaveBeenCalled();
});
it("rejects unsafe source links, impossible dates, excessive evidence and oversized import batches", async () => {
  for (const records of [
    [{ ...source, source_url: "javascript:alert(1)" }],
    [{ ...source, source_url: "https://user:password@ops.example" }],
    [{ ...source, project_date: "2027-02-30" }],
    [{ ...source, facts: { excessive: "x".repeat(60001) } }],
    Array.from({ length: 201 }, () => source),
  ]) expect((await POST(req({ ...payload, data: { records } }))).status).toBe(400);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("returns stale-review conflicts without exposing database errors", async () => {
  mock.rpc.mockResolvedValueOnce({ data: { error: "Record changed. Reload before saving." }, error: null });
  expect((await POST(req())).status).toBe(409);
  mock.rpc.mockResolvedValueOnce({ data: null, error: { message: "private table details" } });
  const r = await POST(req()); expect(r.status).toBe(503); expect(JSON.stringify(await r.json())).not.toContain("private table details");
});
it("passes bounded year, type, status and pagination filters to the server read", async () => {
  const r = await GET(new Request("https://ops.example/api/crm/migration?q=Wedding&page=2&year=2027&status=active&kind=project"));
  expect(r.status).toBe(200);
  expect(mock.read).toHaveBeenCalledWith(actor, { query: "Wedding", page: 2, year: 2027, status: "active", kind: "project" });
  expect(r.headers.get("Cache-Control")).toContain("private");
  mock.read.mockClear();
  expect((await GET(new Request("https://ops.example/api/crm/migration?page=-1"))).status).toBe(400); expect(mock.read).not.toHaveBeenCalled();
});
it("requires a coherent appointment window and renders structured facts as readable evidence", () => {
  expect(observationSchema.safeParse({ ...source, ends_at: "2027-01-01T12:00:00Z" }).success).toBe(false);
  expect(factText({ payment_verified: false, source: ["Invoice", "Installment"] })).toBe("Payment verified: No; Source: Invoice · Installment");
});
