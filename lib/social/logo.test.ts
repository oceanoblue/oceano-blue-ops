import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ actor: vi.fn(), save: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/crm/server", async () => ({
  ...(await vi.importActual<typeof import("@/lib/crm/server")>("@/lib/crm/server")),
  crmActor: mock.actor,
  crmDb: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: (key: string, body: Buffer, options: unknown) => mock.upload(bucket, key, body, options),
        remove: (keys: string[]) => mock.remove(bucket, keys),
        getPublicUrl: (key: string) => ({ data: { publicUrl: `https://files.example.test/${bucket}/${key}` } }),
      }),
    },
  }),
}));
vi.mock("./server", () => ({ saveLogo: mock.save }));

import { POST } from "@/app/api/social/logo/route";
import { CrmError } from "@/lib/crm/server";

const origin = "https://app.oceanoblue.net";
const id = "11111111-1111-4111-8111-111111111111";
const send = (body: unknown, from = origin) =>
  POST(new Request(`${origin}/api/social/logo`, { method: "POST", headers: { origin: from, "content-type": "application/json" }, body: JSON.stringify(body) }));
const png = async (width: number, height: number) =>
  (await sharp({ create: { width, height, channels: 4, background: { r: 20, g: 100, b: 220, alpha: 0.5 } } }).png().toBuffer()).toString("base64");

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  mock.actor.mockResolvedValue(id);
  mock.upload.mockResolvedValue({ error: null });
  mock.remove.mockResolvedValue({ error: null });
  mock.save.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("logo upload", () => {
  it("re-encodes the image as a small PNG, stores it with the brand assets and saves its link", async () => {
    const res = await send({ target: "account", id, content: await png(1600, 800) });
    expect(res.status).toBe(200);
    const [bucket, key, stored, options] = mock.upload.mock.calls[0];
    expect(bucket).toBe("public-assets");
    expect(key).toMatch(/^social-logos\/[0-9a-f-]{36}\.png$/);
    expect(options).toMatchObject({ contentType: "image/png", upsert: false });
    const meta = await sharp(stored).metadata();
    expect(meta).toMatchObject({ format: "png", width: 512, height: 256, hasAlpha: true });
    const url = `https://files.example.test/public-assets/${key}`;
    expect(mock.save).toHaveBeenCalledWith("account", id, url);
    expect(await res.json()).toEqual({ ok: true, url });
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it("does not enlarge a small logo", async () => {
    await send({ target: "client", id, content: await png(120, 60) });
    expect(await sharp(mock.upload.mock.calls[0][2]).metadata()).toMatchObject({ width: 120, height: 60 });
    expect(mock.save).toHaveBeenCalledWith("client", id, expect.any(String));
  });
  it("refuses anything that is not a PNG, JPEG or WebP image, and stores nothing", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>').toString("base64");
    for (const content of [Buffer.from("not an image at all").toString("base64"), svg]) {
      const res = await send({ target: "account", id, content });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Choose a PNG, JPEG or WebP image." });
    }
    expect((await send({ target: "account", id, content: "not base64!" })).status).toBe(400);
    expect((await send({ target: "team", id, content: await png(10, 10) })).status).toBe(400);
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("removes the stored file when the client or sub-account is gone, or the link could not be saved", async () => {
    mock.save.mockResolvedValue(false);
    expect((await send({ target: "account", id, content: await png(10, 10) })).status).toBe(404);
    expect(mock.remove).toHaveBeenCalledWith("public-assets", [mock.upload.mock.calls[0][1]]);
    mock.remove.mockClear();
    mock.save.mockRejectedValue(new CrmError("Social Studio is unavailable. Please retry.", 503));
    expect((await send({ target: "account", id, content: await png(10, 10) })).status).toBe(503);
    expect(mock.remove).toHaveBeenCalledTimes(1);
  });
  it("is for signed-in office staff on the live system, from our own pages", async () => {
    const content = await png(10, 10);
    expect((await send({ target: "account", id, content }, "https://evil.test")).status).toBe(403);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await send({ target: "account", id, content })).status).toBe(403);
    vi.stubEnv("VERCEL_ENV", "production");
    mock.actor.mockRejectedValue(new CrmError("Office access is required.", 403));
    expect((await send({ target: "account", id, content })).status).toBe(403);
    mock.upload.mockResolvedValue({ error: { message: "down" } });
    mock.actor.mockResolvedValue(id);
    expect((await send({ target: "account", id, content })).status).toBe(503);
    expect(mock.save).not.toHaveBeenCalled();
  });
});
