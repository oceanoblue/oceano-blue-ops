import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  send: vi.fn(),
  configured: vi.fn(),
}));
vi.mock("./server", () => ({ crmDb: () => ({ rpc: mock.rpc }) }));
vi.mock("./acquisition-server", () => ({
  appBase: () => "https://ops.example",
}));
vi.mock("@/lib/email/resend", () => ({
  sendEmail: mock.send,
  isEmailConfigured: mock.configured,
}));
import { acquisitionEmail, runAcquisition } from "./acquisition-mail";
import {
  messageTemplateSchema,
  fileTemplateSchema,
  sequenceSchema,
  validateFileAnswers,
} from "./acquisition-types";
const id = "11111111-1111-4111-8111-111111111111";
const context = {
  first_name: '<script>"Alex"</script>',
  client_name: "Alex\r\nInjected",
  project_name: "Brand film",
  project_type: "Video",
};
const job = {
  id,
  lease_token: "lease",
  recipient: "client@example.com",
  subject: "Hello {{client_name}}",
  body: "Hello {{first_name}}\nProject: {{project_name}}",
  context,
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.configured.mockReturnValue(true);
  mock.send.mockResolvedValue({ status: "sent", id: "provider" });
  mock.rpc.mockImplementation(async (name) => ({
    data:
      name === "crm_claim_acquisition"
        ? [job]
        : name === "crm_prepare_acquisition"
          ? { job, file_token: "a".repeat(64) }
          : true,
    error: null,
  }));
});
afterEach(() => vi.unstubAllEnvs());
it("escapes recipient inputs and templates and strips subject newlines", () => {
  const result = acquisitionEmail(job, "a".repeat(64));
  expect(result.subject).not.toMatch(/[\r\n]/);
  expect(result.html).toContain("&lt;script&gt;");
  expect(result.html).not.toContain("<script>");
  expect(result.html).toContain("https://ops.example/smart-files/");
});
it("rejects malformed bearer tokens before rendering a client link", () =>
  expect(() => acquisitionEmail(job, '\" onclick=\"evil')).toThrow());
it("does not send or claim shared-database jobs from preview deployments", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  expect(await runAcquisition()).toEqual({
    processed: 0,
    reason: "production_only",
  });
  expect(mock.rpc).not.toHaveBeenCalled();
  expect(mock.send).not.toHaveBeenCalled();
});
it("persists the matching lease outcome after provider acceptance", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  await runAcquisition();
  expect(mock.send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: job.recipient,
      idempotencyKey: `crm-acquisition/${id}`,
    }),
  );
  expect(mock.rpc).toHaveBeenLastCalledWith("crm_finish_acquisition", {
    p_id: id,
    p_lease: "lease",
    p_status: "accepted",
    p_provider: "provider",
  });
});
it("marks unconfirmed provider calls for review without automatically retrying", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  mock.send.mockRejectedValue(new Error("timeout"));
  await runAcquisition();
  expect(mock.send).toHaveBeenCalledTimes(1);
  expect(mock.rpc).toHaveBeenLastCalledWith(
    "crm_finish_acquisition",
    expect.objectContaining({ p_status: "needs_review", p_provider: null }),
  );
});
it("does not call the provider when a queued job was cancelled or blocked during preparation", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  mock.rpc.mockImplementation(async (name) => ({
    data: name === "crm_claim_acquisition" ? [job] : { skip: true },
    error: null,
  }));
  await runAcquisition();
  expect(mock.send).not.toHaveBeenCalled();
});
it("fails explicitly if the send outcome cannot be persisted", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  mock.rpc.mockImplementation(async (name) => ({
    data:
      name === "crm_claim_acquisition"
        ? [job]
        : name === "crm_prepare_acquisition"
          ? { job }
          : false,
    error: null,
  }));
  await expect(runAcquisition()).rejects.toThrow("confirm");
});
it("requires a ready email template reference in every email workflow step", () => {
  expect(
    sequenceSchema.safeParse({
      name: "Flow",
      form_id: id,
      enabled: false,
      timezone: "America/New_York",
      steps: [{ id, kind: "email", delay: 0, unit: "hours" }],
    }).success,
  ).toBe(false);
});
it("rejects header newlines and insecure document links", () => {
  expect(
    messageTemplateSchema.safeParse({
      name: "Reply",
      subject: "Test\r\nInjected",
      body: "Hello",
      ready: false,
    }).success,
  ).toBe(false);
  expect(
    fileTemplateSchema.safeParse({
      name: "File",
      title: "File",
      blocks: [{ id, kind: "link", title: "Read", url: "javascript:alert(1)" }],
    }).success,
  ).toBe(false);
});
it("validates required questions, options and values without assuming an email field exists", () => {
  const document = fileTemplateSchema.parse({
    name: "Brief",
    title: "Brief",
    blocks: [
      {
        id,
        kind: "question",
        field: {
          key: "goal",
          label: "Goal",
          type: "select",
          required: true,
          options: ["Video", "Photo"],
        },
      },
    ],
  });
  expect(() => validateFileAnswers(document, {})).toThrow("required");
  expect(() => validateFileAnswers(document, { goal: "Other" })).toThrow(
    "Choose",
  );
  expect(
    validateFileAnswers(document, { goal: "Video", untrusted: "ignored" }),
  ).toEqual({ goal: "Video" });
});
it("rejects duplicate question keys and block IDs", () => {
  expect(
    fileTemplateSchema.safeParse({
      name: "Brief",
      title: "Brief",
      blocks: [
        {
          id,
          kind: "question",
          field: { key: "goal", label: "Goal", type: "text" },
        },
        {
          id,
          kind: "question",
          field: { key: "goal", label: "Again", type: "text" },
        },
      ],
    }).success,
  ).toBe(false);
});
it("renders standalone onboarding email with a separate escaped secure scheduling button", () => {
  const result = acquisitionEmail({ ...job, cta_label: 'Book <planning>', cta_url: 'https://ops.example/schedule/planning?a=1&b=2' });
  expect(result.html).toContain('Book &lt;planning&gt;');
  expect(result.html).toContain('https://ops.example/schedule/planning?a=1&amp;b=2');
  expect(result.html).not.toContain('Open your project file');
  expect(() => acquisitionEmail({ ...job, cta_label: "Book", cta_url: "https://user:pass@ops.example" })).toThrow();
  expect(() => acquisitionEmail({ ...job, cta_label: "Book", cta_url: "javascript:alert(1)" })).toThrow();
});
it("requires both email button fields and distinguishes inquiry from manual onboarding sources", () => {
  const message = { name: "Call", subject: "Planning", body: "Hello", ready: false };
  expect(messageTemplateSchema.safeParse({ ...message, cta_label: "Choose a time" }).success).toBe(false);
  expect(messageTemplateSchema.safeParse({ ...message, cta_url: "https://ops.example/schedule" }).success).toBe(false);
  expect(messageTemplateSchema.safeParse({ ...message, cta_label: "Choose a time", cta_url: "https://ops.example/schedule" }).success).toBe(true);
  const flow = { name: "Onboarding", enrollment_kind: "onboarding", form_id: null, enabled: false, timezone: "America/New_York", steps: [{ id, kind: "task", delay: 0, unit: "hours", task_title: "Review" }] };
  expect(sequenceSchema.safeParse(flow).success).toBe(true);
  expect(sequenceSchema.safeParse({ ...flow, form_id: id }).success).toBe(false);
  expect(sequenceSchema.safeParse({ ...flow, enrollment_kind: "inquiry" }).success).toBe(false);
});
