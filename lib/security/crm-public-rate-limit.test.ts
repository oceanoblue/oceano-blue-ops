import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/crm/server", () => ({ crmDb: () => ({ rpc: mock.rpc }) }));
import { enforceCrmPublicRateLimit } from "./crm-public-rate-limit";
const req = new Request("https://ops.example/api", { headers: { "x-forwarded-for": "192.0.2.1" } });
beforeEach(() => { vi.resetAllMocks(); mock.rpc.mockResolvedValue({ data: 1, error: null }); });
it("uses durable fixed-window counts and hashes client addresses before persisting keys", async () => {
  expect(await enforceCrmPublicRateLimit(req, "booking", 8, 3600)).toBeNull();
  const key = mock.rpc.mock.calls[0][1].p_key;
  expect(key).toMatch(/^crm-public:booking:[a-f0-9]{64}:\d+$/);
  expect(key).not.toContain("192.0.2.1");
});
it("blocks excess requests with a retry hint", async () => {
  mock.rpc.mockResolvedValue({ data: 9, error: null });
  const response = await enforceCrmPublicRateLimit(req, "booking", 8, 3600);
  expect(response?.status).toBe(429); expect(response?.headers.get("Retry-After")).toBe("3600"); expect(response?.headers.get("Cache-Control")).toBe("no-store");
});
it.each([{ data: null, error: null }, { data: "1", error: null }, { data: 0, error: null }, { data: NaN, error: null }, { data: 1, error: { message: "private details" } }])("fails closed when the limiter response is unavailable or malformed", async outcome => {
  mock.rpc.mockResolvedValue(outcome);
  const response = await enforceCrmPublicRateLimit(req, "booking", 8, 3600);
  expect(response?.status).toBe(503); expect(JSON.stringify(await response?.json())).not.toContain("private details");
});
it("fails closed on a limiter connection error", async () => {
  mock.rpc.mockRejectedValue(new Error("database offline"));
  expect((await enforceCrmPublicRateLimit(req, "booking", 8, 3600))?.status).toBe(503);
});
