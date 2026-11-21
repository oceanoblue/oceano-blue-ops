import { z } from "zod";
import { CrmError, crmDb, crmError } from "@/lib/crm/server";
import { workflowError } from "@/lib/social/review";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** Stages at which a client has been shown a piece. */
const SHOWN = ["client_review", "approved", "scheduled", "published"];

/**
 * A client's page loads the image or video for a piece from here. No sign-in:
 * the secret in the client's own link is the key, and it only opens a file
 * that belongs to that client and that the client has already been shown.
 * Anything else is "not found". The answer is a short-lived link to the file.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const query = new URL(req.url).searchParams;
    const token = query.get("token") ?? "";
    const id = z.string().uuid().safeParse((await params).id);
    if (!TOKEN_RE.test(token) || !id.success) throw new CrmError("Creative unavailable.", 404);
    const db = crmDb();
    const { data: item, error } = await db
      .from("social_content_items")
      .select("creative_path,review_revision,status,account_id")
      .eq("id", id.data)
      .maybeSingle();
    if (error) workflowError(error);
    if (!item?.creative_path || String(item.review_revision) !== query.get("revision") || !SHOWN.includes(item.status))
      throw new CrmError("Creative unavailable.", 404);
    const { data: account, error: accountError } = await db.from("social_accounts").select("program_id").eq("id", item.account_id).eq("is_active", true).maybeSingle();
    if (accountError) workflowError(accountError);
    if (!account) throw new CrmError("Creative unavailable.", 404);
    const { data: program, error: programError } = await db
      .from("social_programs")
      .select("id")
      .eq("id", account.program_id)
      .eq("report_token", token)
      .in("status", ["active", "onboarding"])
      .maybeSingle();
    if (programError) workflowError(programError);
    if (!program) throw new CrmError("Creative unavailable.", 404);
    const signed = await db.storage.from("social-creative").createSignedUrl(item.creative_path, 900);
    if (!signed.data) throw new CrmError("Creative temporarily unavailable.", 503);
    return new Response(null, { status: 302, headers: { Location: signed.data.signedUrl, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (e) {
    return crmError(e);
  }
}
