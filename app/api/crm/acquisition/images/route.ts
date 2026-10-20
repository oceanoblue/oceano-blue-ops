import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import {
  crmActor,
  crmDb,
  crmError,
  CrmError,
  readJson,
  sameOrigin,
} from "@/lib/crm/server";
export async function POST(req: Request) {
  try {
    await crmActor();
    sameOrigin(req);
    if (process.env.VERCEL_ENV !== "production")
      throw new CrmError("Upload photos from production Ops.", 403);
    const body = z
      .object({
        content: z
          .string()
          .min(1)
          .max(4000000)
          .regex(/^[A-Za-z0-9+/]+={0,2}$/),
      })
      .parse(await readJson(req, 4010000));
    const bytes = Buffer.from(body.content, "base64");
    if (bytes.length > 3000000)
      throw new CrmError("Choose an image smaller than 3 MB.");
    let image: Buffer;
    try {
      const source = sharp(bytes, {
        limitInputPixels: 40000000,
        animated: false,
      });
      const metadata = await source.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? ""))
        throw new Error("format");
      image = await source
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 88 })
        .toBuffer();
    } catch {
      throw new CrmError("Choose a valid JPEG, PNG or WebP photo.");
    }
    const bucket = crmDb().storage.from("public-assets"),
      key = `smart-files/${randomUUID()}.jpg`;
    const { error } = await bucket.upload(key, image, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (error) throw new CrmError("Your photo could not be uploaded.", 503);
    return Response.json(
      { url: bucket.getPublicUrl(key).data.publicUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return crmError(e);
  }
}
