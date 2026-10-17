import { beforeEach, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn() }));
vi.mock("./server", async () => {
  const actual = await vi.importActual<typeof import("./server")>("./server");
  return { ...actual, crmActor: mock.actor, crmDb: () => ({ rpc: mock.rpc }) };
});
import { POST } from "@/app/api/crm/route";
import { CrmError, readJson } from "./server";
const actor = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
const body = {
  action: "contact_create",
  id,
  data: { full_name: "Test", email: "test@example.com" },
};
function req(b: unknown = body, origin = "https://ops.test") {
  return new Request("https://ops.test/api/crm", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.actor.mockResolvedValue(actor);
  mock.rpc.mockResolvedValue({ data: { id, version: 1 }, error: null });
});
it("rejects unauthorized clients and contractors before database access", async () => {
  mock.actor.mockRejectedValue(new CrmError("Office access required.", 403));
  expect((await POST(req())).status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("uses the verified session actor and ignores forged identities", async () => {
  expect((await POST(req({ ...body, actor: id }))).status).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith(
    "crm_action",
    expect.objectContaining({ p_actor: actor }),
  );
});
it("blocks cross-origin mutations", async () => {
  expect((await POST(req(body, "https://attacker.test"))).status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("returns a conflict for stale edits", async () => {
  mock.rpc.mockResolvedValue({
    data: { error: "Record changed. Reload before saving." },
    error: null,
  });
  expect((await POST(req())).status).toBe(409);
});
it("rejects invalid contacts before any mutation", async () => {
  expect(
    (
      await POST(
        req({ ...body, data: { full_name: "Test", email: "invalid" } }),
      )
    ).status,
  ).toBe(400);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("does not return database internals to callers", async () => {
  mock.rpc.mockResolvedValue({
    data: null,
    error: { message: "secret schema constraint" },
  });
  const response = await POST(req());
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain("secret");
});
it("bounds streamed bodies even without a content-length header", async () => {
  await expect(
    readJson(req({ huge: "x".repeat(1000) }), 100),
  ).rejects.toMatchObject({ status: 413 });
});
it("rejects malformed JSON and non-JSON bodies", async () => {
  await expect(
    readJson(
      new Request("https://ops.test", { method: "POST", body: "not-json" }),
    ),
  ).rejects.toMatchObject({ status: 415 });
  await expect(
    readJson(
      new Request("https://ops.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    ),
  ).rejects.toThrow("Invalid request.");
});
