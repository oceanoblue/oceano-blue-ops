import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { crmActor, crmDb, crmError, CrmError, readJson, sameOrigin } from "@/lib/crm/server";
import { LOGO_TARGETS } from "@/lib/social/schema";
import { saveLogo } from "@/lib/social/server";

export const dynamic = "force-dynamic";

const upload = z.object({
  target: z.enum(LOGO_TARGETS),
  id: z.string().uuid(),
  /** The image file, base64 encoded. */
  content: z
    .string()
    .min(1)
    .max(4000000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

/**
 * Office: upload a logo for a client or a sub-account. The image is checked,
 * re-encoded as a small PNG (so nothing but pixels is kept) and stored in the
 * public brand-assets bucket; its link is saved on the client or sub-account.
 */
export async function POST(req: Request) {
  try {
    await crmActor();
    sameOrigin(req);
    if (process.env.VERCEL_ENV !== "production") throw new CrmError("Logos are uploaded from the live system only.", 403);
    const body = upload.parse(await readJson(req, 4010000));
    const bytes = Buffer.from(body.content, "base64");
    if (bytes.length > 3000000) throw new CrmError("Choose an image smaller than 3 MB.");
    let image: Buffer;
    try {
      const source = sharp(bytes, { limitInputPixels: 40000000, animated: false });
      const metadata = await source.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("format");
      // PNG keeps a transparent background, which most logos have.
      image = await source.rotate().resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    } catch {
      throw new CrmError("Choose a PNG, JPEG or WebP image.");
    }
    const bucket = crmDb().storage.from("public-assets");
    const key = `social-logos/${randomUUID()}.png`;
    const { error } = await bucket.upload(key, image, { contentType: "image/png", upsert: false });
    if (error) throw new CrmError("The logo could not be uploaded. Please try again.", 503);
    const url = bucket.getPublicUrl(key).data.publicUrl;
    let saved = false;
    try {
      saved = await saveLogo(body.target, body.id, url);
    } finally {
      // Never leave a stray file behind when its link was not saved.
      if (!saved) await bucket.remove([key]).catch(() => undefined);
    }
    if (!saved) throw new CrmError(body.target === "client" ? "That client no longer exists." : "That sub-account no longer exists.", 404);
    return Response.json({ ok: true, url }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return crmError(e);
  }
}
