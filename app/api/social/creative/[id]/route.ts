import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CrmError, crmActor, crmDb, crmError, readJson, sameOrigin } from "@/lib/crm/server";
import { workflowError } from "@/lib/social/review";
export const dynamic = "force-dynamic";

const MIME = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"] as const;
const BUCKET = "social-creative";
const upload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upload"), type: z.enum(MIME), size: z.number().int().min(1).max(209715200) }),
  z.object({ action: z.literal("attach"), upload_id: z.string().uuid(), revision: z.number().int().positive() }),
]);
type Context = { params: Promise<{ id: string }> };

/** Office staff open the saved file for a piece. A client's page uses /api/social-public/creative instead. */
export async function GET(req: Request, { params }: Context) {
  try {
    await crmActor();
    const query = new URL(req.url).searchParams;
    const id = z.string().uuid().parse((await params).id);
    const db = crmDb();
    const { data: item, error } = await db.from("social_content_items")
      .select("creative_path,review_revision").eq("id", id).maybeSingle();
    if (error) workflowError(error);
    // With no revision asked for, open the current one: a card or a list does not know the number.
    const wanted = query.get("revision");
    if (!item?.creative_path || (wanted !== null && String(item.review_revision) !== wanted)) throw new CrmError("Creative unavailable.", 404);
    const signed = await db.storage.from(BUCKET).createSignedUrl(item.creative_path, 900);
    if (!signed.data) throw new CrmError("Creative temporarily unavailable.", 503);
    return new Response(null, { status: 302, headers: { Location: signed.data.signedUrl, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (e) { return crmError(e); }
}

export async function POST(req: Request, { params }: Context) {
  try {
    const actor = await crmActor();
    sameOrigin(req);
    if (process.env.VERCEL_ENV !== "production") throw new CrmError("Uploads are available on the live system.", 403);
    const id = z.string().uuid().parse((await params).id);
    const body = upload.parse(await readJson(req, 2000));
    const db = crmDb();
    const { data: item, error } = await db.from("social_content_items").select("id,status,review_revision,kind").eq("id", id).maybeSingle();
    if (error) workflowError(error);
    if (!item) throw new CrmError("Piece unavailable.", 404);
    if (["scheduled", "published"].includes(item.status)) throw new CrmError("This piece already reached its publisher.", 409);
    const bucket = db.storage.from(BUCKET);
    if (body.action === "upload") {
      const uploadId = randomUUID();
      const signed = await bucket.createSignedUploadUrl(`staging/${actor}/${id}/${uploadId}`, { upsert: false });
      if (!signed.data) throw new CrmError("Unable to start the upload.", 503);
      return Response.json({ upload_id: uploadId, bucket: BUCKET, path: signed.data.path, token: signed.data.token });
    }
    if (item.review_revision !== body.revision) throw new CrmError("This piece changed. Reload before attaching a file.", 409);
    const source = `staging/${actor}/${id}/${body.upload_id}`;
    const { data: info } = await bucket.info(source);
    if (!info || !info.size || info.size > 209715200 || !MIME.includes(info.contentType as typeof MIME[number])) {
      throw new CrmError("Upload a supported image or video before attaching it.", 400);
    }
    if (item.kind === "reel" && !info.contentType?.startsWith("video/")) throw new CrmError("A reel needs a video file.");
    // The upload credential can only write to staging. No client receives a write credential for a frozen object.
    const frozen = `versions/${id}/${randomUUID()}`;
    const copied = await bucket.copy(source, frozen);
    if (copied.error) throw new CrmError("Unable to freeze the upload. Try again.", 503);
    const saved = await db.from("social_content_items")
      .update({ creative_path: frozen, creative_type: info.contentType, updated_by: actor, updated_at: new Date().toISOString() })
      .eq("id", id).eq("review_revision", body.revision).select("id");
    // An ambiguous database error may mean the attachment committed. Never delete that snapshot.
    if (saved.error) workflowError(saved.error);
    if (!saved.data?.length) {
      await bucket.remove([frozen]);
      throw new CrmError("This piece changed during the upload. Reload before attaching a file.", 409);
    }
    await bucket.remove([source]);
    return Response.json({ ok: true });
  } catch (e) { return crmError(e); }
}
