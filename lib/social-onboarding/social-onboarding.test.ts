import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  submit: vi.fn(),
  sign: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@/lib/crm/server", async () => ({
  ...(await vi.importActual<typeof import("@/lib/crm/server")>("@/lib/crm/server")),
  crmDb: () => ({ rpc: mock.rpc }),
}));
vi.mock("./server", () => ({
  submitIntake: mock.submit,
  signFileUpload: mock.sign,
  confirmFileUpload: mock.confirm,
}));

import { POST as submit } from "@/app/api/social-onboarding/route";
import { POST as files } from "@/app/api/social-onboarding/files/route";
import {
  answerRows,
  answersSchema,
  fileKind,
  fileProblem,
  safeFileName,
  MAX_FILE_BYTES,
} from "./schema";

const origin = "https://app.oceanoblue.net";
const id = "11111111-1111-4111-8111-111111111111";
const fileId = "22222222-2222-4222-8222-222222222222";
const token = "a".repeat(43);
const answers = {
  business_name: "Bethel Properties",
  contact_name: "Test Client",
  email: "client@example.test",
  package: "Social Media Management",
  brand_guide: "No, please create a look for us",
  goal: "More listing inquiries",
  approval: "Send me the month's calendar to approve",
  platforms: { facebook: { handle: "facebook.com/test", access: "I need help with this" } },
};
const req = (path: string, body: unknown, from = origin) =>
  new Request(`${origin}${path}`, {
    method: "POST",
    headers: { origin: from, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  mock.rpc.mockResolvedValue({ data: 1, error: null });
  mock.sign.mockResolvedValue({ already_uploaded: false, bucket: "social-onboarding", path: "p", token: "t", signed_url: "u" });
});
afterEach(() => vi.unstubAllEnvs());

describe("answers", () => {
  it("accepts the minimum a client must give and fills the rest with blanks", () => {
    const parsed = answersSchema.parse(answers);
    expect(parsed.platforms.instagram).toEqual({ handle: "", access: "" });
    expect(parsed.library_link).toBe("");
  });
  it("explains what is missing in plain words", () => {
    const result = answersSchema.safeParse({ ...answers, package: "", email: "nope" });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message);
    expect(messages).toContain("Choose a package.");
    expect(messages).toContain("Check the email address.");
  });
  it("rejects choices that are not on the form and links that are not web links", () => {
    expect(answersSchema.safeParse({ ...answers, tone: "Sarcastic" }).success).toBe(false);
    expect(answersSchema.safeParse({ ...answers, library_link: "javascript:alert(1)" }).success).toBe(false);
    expect(answersSchema.safeParse({ ...answers, business_name: "A\nB" }).success).toBe(false);
  });
  it("lists only answered questions for the office", () => {
    const rows = answerRows(answersSchema.parse(answers));
    expect(rows.find((r) => r.label === "Facebook Page")?.value).toBe("facebook.com/test — I need help with this");
    expect(rows.some((r) => r.label === "Instagram")).toBe(false);
  });
});

describe("files", () => {
  it("sorts files by what they are and refuses what we can't use", () => {
    expect(fileKind("Logo.AI")).toBe("design");
    expect(fileKind("tour.mov")).toBe("video");
    expect(fileProblem("installer.exe", 10)).toMatch(/isn't supported/);
    expect(fileProblem("page.html", 10)).toMatch(/isn't supported/);
    expect(fileProblem("film.mp4", MAX_FILE_BYTES + 1)).toMatch(/2 GB/);
    expect(fileProblem("logo.png", 0)).toMatch(/empty/);
    expect(fileProblem("logo.png", 2048)).toBeNull();
  });
  it("never lets a file name shape the storage path", () => {
    expect(safeFileName("../../etc/passwd.png")).toBe("etc_passwd.png");
    expect(safeFileName("Brand Guide (final) v2.PDF")).toBe("Brand_Guide_final_v2.pdf");
    expect(safeFileName("....png")).toBe("file.png");
  });
});

describe("public intake API", () => {
  const body = { submission_id: id, upload_token: token, expected_files: 2, answers };
  it("saves a valid intake", async () => {
    const res = await submit(req("/api/social-onboarding", body));
    expect(res.status).toBe(200);
    expect(mock.submit).toHaveBeenCalledWith(expect.objectContaining({ submission_id: id, expected_files: 2 }));
  });
  it("is read-only outside production and refuses other origins", async () => {
    expect((await submit(req("/api/social-onboarding", body, "https://other.example"))).status).toBe(403);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await submit(req("/api/social-onboarding", body))).status).toBe(403);
    expect(mock.submit).not.toHaveBeenCalled();
  });
  it("quietly drops bot submissions and tells people what to fix", async () => {
    expect((await submit(req("/api/social-onboarding", { ...body, company_site: "spam.example" }))).status).toBe(200);
    expect(mock.submit).not.toHaveBeenCalled();
    const res = await submit(req("/api/social-onboarding", { ...body, answers: { ...answers, goal: "" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/what you want social media to do/);
  });
  it("rate limits by address", async () => {
    mock.rpc.mockResolvedValueOnce({ data: 9, error: null });
    expect((await submit(req("/api/social-onboarding", body))).status).toBe(429);
    expect(mock.submit).not.toHaveBeenCalled();
  });
});

describe("public upload API", () => {
  const sign = { action: "sign", submission_id: id, upload_token: token, file_id: fileId, name: "logo.png", size: 2048, content_type: "image/png" };
  it("signs one upload and confirms it", async () => {
    const res = await files(req("/api/social-onboarding/files", sign));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, path: "p", token: "t" });
    expect((await files(req("/api/social-onboarding/files", { action: "done", submission_id: id, upload_token: token, file_id: fileId }))).status).toBe(200);
    expect(mock.confirm).toHaveBeenCalledOnce();
  });
  it("refuses oversized files, missing secrets, other origins and previews", async () => {
    expect((await files(req("/api/social-onboarding/files", { ...sign, size: MAX_FILE_BYTES + 1 }))).status).toBe(400);
    expect((await files(req("/api/social-onboarding/files", { ...sign, upload_token: "short" }))).status).toBe(400);
    expect((await files(req("/api/social-onboarding/files", sign, "https://other.example"))).status).toBe(403);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await files(req("/api/social-onboarding/files", sign))).status).toBe(403);
    expect(mock.sign).not.toHaveBeenCalled();
  });
});
