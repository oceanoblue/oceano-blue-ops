import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ actor: vi.fn(), dispatch: vi.fn() }));
vi.mock("./server", async () => {
  const actual = await vi.importActual<typeof import("./server")>("./server");
  return { ...actual, crmActor: mock.actor };
});
vi.mock("./scheduling-mail", () => ({ runSessionNotifications: mock.dispatch }));
import { POST } from "@/app/api/crm/scheduling/route";
import { CrmError } from "./server";
const request = (origin = "https://app.oceanoblue.net") => new Request("https://app.oceanoblue.net/api/crm/scheduling", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify({ action: "dispatch" }) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("VERCEL_ENV", "production"); mock.actor.mockResolvedValue("office-user"); mock.dispatch.mockResolvedValue({ processed: 2, results: [] }); });
afterEach(() => vi.unstubAllEnvs());
it("requires office authorization before dispatching due notifications", async () => { mock.actor.mockRejectedValue(new CrmError("Office access required.", 403)); expect((await POST(request())).status).toBe(403); expect(mock.dispatch).not.toHaveBeenCalled(); });
it("rejects cross-origin dispatch without touching the worker", async () => { expect((await POST(request("https://unrelated.example"))).status).toBe(403); expect(mock.dispatch).not.toHaveBeenCalled(); });
it("blocks preview dispatch before any provider work", async () => { vi.stubEnv("VERCEL_ENV", "preview"); expect((await POST(request())).status).toBe(403); expect(mock.dispatch).not.toHaveBeenCalled(); });
it("processes only through the existing leased worker and returns a private response", async () => { const result = await POST(request()); expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store"); expect(await result.json()).toEqual({ processed: 2, results: [] }); expect(mock.dispatch).toHaveBeenCalledOnce(); });
