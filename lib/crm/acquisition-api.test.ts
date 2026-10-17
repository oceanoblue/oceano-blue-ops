import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  actor: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  file: vi.fn(),
  run: vi.fn(),
  row: vi.fn(),
}));
vi.mock("./server", async () => ({
  ...(await vi.importActual<typeof import("./server")>("./server")),
  crmActor: mock.actor,
  crmDb: () => ({ rpc: mock.rpc, from: mock.from }),
}));
vi.mock("./acquisition-server", () => ({
  publicFile: mock.file,
  acquisitionRead: vi.fn(),
  appBase: () => "https://ops.example",
}));
vi.mock("./acquisition-mail", () => ({ runAcquisition: mock.run }));
import { POST } from "@/app/api/crm/acquisition/route";
import { GET as fileDetails } from "@/app/api/crm/acquisition/files/[id]/route";
import { POST as respond } from "@/app/api/smart-files/[token]/route";
import { GET as cron } from "@/app/api/cron/crm-acquisition/route";
import { CrmError } from "./server";
const actor = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  token = "a".repeat(64);
const action = {
  id,
  version: 0,
  action: "message_template_save",
  data: { name: "Reply", subject: "Received", body: "Thank you", ready: false },
};
const req = (
  body: unknown = action,
  path = "/api/crm/acquisition",
  origin = "https://ops.example",
) =>
  new Request(`https://ops.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  mock.actor.mockResolvedValue(actor);
  mock.rpc.mockImplementation(async (name) => ({
    data: name === "bump_rate_limit" ? 1 : { id, ok: true },
    error: null,
  }));
  mock.file.mockResolvedValue({
    document: {
      name: "Brief",
      title: "Brief",
      description: "",
      ready: true,
      blocks: [
        {
          id,
          kind: "question",
          field: {
            key: "goals",
            label: "Goals",
            type: "textarea",
            required: true,
          },
        },
      ],
    },
  });
  mock.row.mockResolvedValue({
    data: {
      id,
      snapshot: {},
      context: {},
      access_token: token,
      expires_at: "2099-01-01T00:00:00Z",
      revoked_at: null,
      crm_file_responses: {
        answers: { goals: "Film" },
        created_at: "2026-10-17T12:00:00Z",
      },
    },
    error: null,
  });
  mock.from.mockImplementation(() => {
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: mock.row };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    return chain;
  });
});
afterEach(() => vi.unstubAllEnvs());
it("requires an active office session before acquiring database access", async () => {
  mock.actor.mockRejectedValue(new CrmError("Office access required.", 403));
  expect((await POST(req())).status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("uses the real session actor and rejects cross-origin writes", async () => {
  expect((await POST(req({ ...action, actor: id }))).status).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith(
    "crm_acquisition_action",
    expect.objectContaining({ p_actor: actor }),
  );
  mock.rpc.mockClear();
  expect(
    (await POST(req(action, undefined, "https://evil.example"))).status,
  ).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("rejects invalid templates before a write", async () => {
  expect(
    (
      await POST(
        req({ ...action, data: { ...action.data, subject: "Bad\r\nheader" } }),
      )
    ).status,
  ).toBe(400);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it.each(["job_approve", "job_retry", "issue_file"])(
  "prevents %s from creating production mail through a preview",
  async (action) => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const data =
      action === "issue_file"
        ? {
            project_id: id,
            message_template_id: actor,
            file_template_id: actor,
          }
        : {};
    expect((await POST(req({ action, id, data }))).status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
  },
);
it("returns a conflict for stale template and workflow edits", async () => {
  mock.rpc.mockResolvedValue({
    data: { error: "Record changed. Reload before saving." },
    error: null,
  });
  expect((await POST(req())).status).toBe(409);
});
it("normalizes one-to-one response relations for the office viewer and keeps tokens out of named fields", async () => {
  const r = await fileDetails(new Request("https://ops.example"), {
    params: Promise.resolve({ id }),
  });
  expect(r.status).toBe(200);
  const b = await r.json();
  expect(b.crm_file_responses).toHaveLength(1);
  expect(b).not.toHaveProperty("access_token");
  expect(b.url).toBe(`https://ops.example/smart-files/${token}`);
  expect(r.headers.get("cache-control")).toContain("no-store");
});
it("rejects missing required client answers and ignores unrelated posted fields", async () => {
  const params = { params: Promise.resolve({ token }) };
  expect(
    (await respond(req({ action: "respond", id, answers: {} }), params)).status,
  ).toBe(400);
  expect(mock.rpc).not.toHaveBeenCalledWith(
    "crm_file_event",
    expect.anything(),
  );
  expect(
    (
      await respond(
        req({
          action: "respond",
          id,
          answers: { goals: "Film", untrusted: "discard" },
        }),
        params,
      )
    ).status,
  ).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith(
    "crm_file_event",
    expect.objectContaining({
      p_answers: { goals: "Film" },
      p_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
});
it("fails closed when the durable public rate limiter is unavailable", async () => {
  mock.rpc.mockResolvedValue({ data: null, error: { message: "internal" } });
  expect(
    (
      await respond(req({ action: "view", id }), {
        params: Promise.resolve({ token }),
      })
    ).status,
  ).toBe(503);
  expect(mock.file).not.toHaveBeenCalled();
});
it("protects the cron runner with the configured shared secret", async () => {
  vi.stubEnv("CRON_SECRET", "cron-test-secret");
  expect(
    (await cron(new Request("https://ops.example/api/cron/crm-acquisition")))
      .status,
  ).toBe(401);
  expect(mock.run).not.toHaveBeenCalled();
  mock.run.mockResolvedValue({ processed: 0 });
  expect(
    (
      await cron(
        new Request("https://ops.example/api/cron/crm-acquisition", {
          headers: { authorization: "Bearer cron-test-secret" },
        }),
      )
    ).status,
  ).toBe(200);
});

it("makes preview acquisition configuration read-only, including template edits", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  expect((await POST(req())).status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
});
