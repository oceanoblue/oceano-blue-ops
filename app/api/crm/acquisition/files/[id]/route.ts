import { z } from "zod";
import { crmActor, crmDb, crmError, CrmError, readJson, sameOrigin } from "@/lib/crm/server";
import { appBase } from "@/lib/crm/acquisition-server";
import { createHash } from "node:crypto";
import { clientIp } from "@/lib/security/rate-limit";
import { countersignConsent } from "@/lib/crm/smart-experience-types";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await crmActor();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const { data, error } = await crmDb()
      .from("crm_issued_files")
      .select(
        "id,snapshot,context,access_token,expires_at,revoked_at,responded_at,crm_file_responses(answers,created_at)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new CrmError("File details are unavailable.", 503);
    if (!data) throw new CrmError("File not found.", 404);
    const { access_token, ...safe } = data;
    const responses = data.crm_file_responses;
    let acceptance = null;
    let countersignature = null;
    if (data.snapshot?.blocks?.some((b: { kind: string }) => b.kind === "experience")) {
      const result = await crmDb().from("crm_file_acceptances").select("package_id,addon_ids,signer_name,signer_email,agreement,consent_text,answers,document_hash,payload_hash,total_cents,deposit_cents,accepted_at,invoice_id").eq("file_id", id).maybeSingle();
      if (result.error) throw new CrmError("Signed booking details are unavailable.", 503);
      acceptance = result.data;
      const signed = await crmDb().from("crm_file_countersignatures").select("signer_name,signed_at,document_hash,consent_text").eq("file_id", id).maybeSingle();
      if (signed.error) throw new CrmError("Office signature details are unavailable.", 503);
      countersignature = signed.data;
    }
    return Response.json(
      {
        ...safe,
        acceptance,
        countersignature,
        crm_file_responses: Array.isArray(responses)
          ? responses
          : responses
            ? [responses]
            : [],
        url:
          !data.revoked_at && Date.parse(data.expires_at) > Date.now()
            ? `${appBase()}/smart-files/${access_token}`
            : null,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (e) {
    return crmError(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await crmActor();
    sameOrigin(req);
    if (process.env.VERCEL_ENV !== "production") throw new CrmError("Open production Ops to sign agreements.", 403);
    const id = z.string().uuid().parse((await params).id);
    const body = z.object({
      signer_name: z.string().trim().min(2).max(120),
      consent: z.literal(true),
      document_hash: z.string().regex(/^[a-f0-9]{64}$/),
      payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
    }).parse(await readJson(req, 4000));
    const { data, error } = await crmDb().rpc("crm_file_countersign", {
      p_actor: actor, p_file: id,
      p_data: { ...body, consent_text: countersignConsent, ip_hash: createHash("sha256").update(clientIp(req)).digest("hex"), user_agent: req.headers.get("user-agent") ?? "" },
    });
    if (error) throw new CrmError("Signature could not be saved. Please retry.", 503);
    if (data?.error) throw new CrmError(data.error, 409);
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return crmError(e); }
}
