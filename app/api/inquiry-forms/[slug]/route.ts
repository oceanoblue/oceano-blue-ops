import { createHash } from "node:crypto";
import { z } from "zod";
import { crmDb, readJson, crmError, CrmError } from "@/lib/crm/server";
import { validateAnswers, fieldSchema } from "@/lib/crm/types";
import { clientIp, windowBucket } from "@/lib/security/rate-limit";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    if (process.env.VERCEL_ENV !== "production")
      throw new CrmError(
        "Submit inquiries through the live website form.",
        403,
      );
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new CrmError("Submit using the inquiry form.", 403);
    const slug = z
      .string()
      .regex(/^[a-z0-9-]{1,80}$/)
      .parse((await params).slug);
    const body = z
      .object({
        submission_id: z.string().uuid(),
        website: z.string().max(500).default(""),
        answers: z.unknown(),
        attribution: z
          .object({
            source: z.string().max(150).default(""),
            medium: z.string().max(150).default(""),
            campaign: z.string().max(150).default(""),
            referrer: z.string().max(500).default(""),
          })
          .prefault({}),
      })
      .parse(await readJson(req));
    if (body.website) return Response.json({ ok: true });
    const db = crmDb();
    const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
    const limited = await db.rpc("bump_rate_limit", {
      p_key: `crm-inquiry:${ipHash}:${windowBucket(Date.now(), 600)}`,
    });
    if (limited.error) throw new CrmError("Please try again shortly.", 503);
    if (typeof limited.data !== "number" || limited.data > 10)
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": "600" } },
      );
    const { data: form, error } = await db
      .from("crm_forms")
      .select("*")
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();
    if (error)
      throw new CrmError("The inquiry form is temporarily unavailable.", 503);
    if (!form) throw new CrmError("Form unavailable.", 404);
    let answers: Record<string, string>;
    try {
      answers = validateAnswers(
        z.array(fieldSchema).parse(form.fields),
        body.answers,
      );
    } catch (e) {
      throw new CrmError(
        e instanceof Error ? e.message : "Check your answers.",
      );
    }
    if (answers.full_name.length > 180)
      throw new CrmError("Please shorten your name.");
    const hash = createHash("sha256")
      .update(JSON.stringify({ answers, attribution: body.attribution }))
      .digest("hex");
    const result = await db.rpc("crm_submit_inquiry", {
      p_form: form.id,
      p_request: body.submission_id,
      p_hash: hash,
      p_answers: answers,
      p_attribution: body.attribution,
    });
    if (result.error)
      throw new CrmError("Your inquiry could not be saved. Please retry.", 503);
    if (result.data?.error) throw new CrmError(result.data.error, 409);
    return Response.json(
      { ok: true, message: form.success_message },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return crmError(e);
  }
}
