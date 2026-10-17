import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ user: null as { id: string } | null, member: null as { role: string; is_active: boolean } | null, table: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: mock.user } }) }, from: (name: string) => { mock.table(name); const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: mock.member }) }; return query; } }) }));
import { proxy } from "@/proxy";
const token = "a".repeat(64);
const response = (path: string) => proxy(new NextRequest(`https://ops.example${path}`));
beforeEach(() => { vi.clearAllMocks(); mock.user = null; mock.member = null; });
it.each([
  "/meet/consultation", `/meet/manage/${token}`, `/pay/project/${token}`,
  "/api/crm/scheduling/public/consultation", `/api/crm/scheduling/manage/${token}`,
  `/api/crm/billing/checkout/${token}`, "/api/crm/scheduling/notifications",
  "/api/booking", "/api/booking/v2", "/api/booking/reschedule/example",
])("keeps client/server-secret route %s reachable without an office cookie", async path => {
  const r = await response(path);
  expect(r.status).toBe(200); expect(r.headers.get("x-middleware-next")).toBe("1"); expect(r.headers.get("location")).toBeNull(); expect(mock.table).not.toHaveBeenCalled();
});
it.each([
  "/api/crm/billing", "/api/crm/scheduling", "/api/crm/migration", "/api/crm/acquisition",
  "/api/crm/scheduling/appointments/11111111-1111-4111-8111-111111111111",
])("returns a clean 401 for unsigned office API %s", async path => {
  const r = await response(path); expect(r.status).toBe(401); expect(await r.json()).toEqual({ error: "unauthorized" }); expect(r.headers.get("location")).toBeNull();
});
it.each(["/dashboard/crm/billing", "/dashboard/crm/scheduling", "/dashboard/crm/migration"])("keeps office page %s behind login", async path => {
  const r = await response(path); expect(r.status).toBe(307); const target = new URL(r.headers.get("location")!); expect(target.pathname).toBe("/login"); expect(target.searchParams.get("next")).toBe(path);
});
it.each(["/api/crm/billing/checkouts/example", "/api/crm/scheduling/publicity", "/api/crm/scheduling/manage-admin"])("does not open similar-looking office path %s", async path => expect((await response(path)).status).toBe(401));
it.each([`/meet/manage/${token}`, `/api/crm/scheduling/manage/${token}`, `/pay/project/${token}`, `/api/crm/billing/checkout/${token}`])("protects private client token URLs from caches, referrers and indexing: %s", async path => {
  const r = await response(path); expect(r.headers.get("Cache-Control")).toBe("private, no-store"); expect(r.headers.get("Referrer-Policy")).toBe("no-referrer"); expect(r.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
});
it("blocks clients, inactive members and photographers from new office APIs", async () => {
  mock.user = { id: "person" };
  for (const member of [null, { role: "admin", is_active: false }, { role: "photographer", is_active: true }]) {
    mock.member = member;
    for (const path of ["/api/crm/billing", "/api/crm/scheduling", "/api/crm/migration"]) expect((await response(path)).status).toBe(403);
  }
  mock.member = { role: "admin", is_active: true }; expect((await response("/api/crm/billing")).headers.get("x-middleware-next")).toBe("1");
});
