import { z } from "zod";
import {
  crmDb,
  crmError,
  CrmError,
  readJson,
  sameOrigin,
} from "@/lib/crm/server";
import {
  experienceFile,
  experienceState,
  acceptExperience,
} from "@/lib/crm/smart-experience-server";
import { acceptanceSchema } from "@/lib/crm/smart-experience-types";
import {
  bookSession,
  publicSessionType,
  readSessionType,
  sessionAvailability,
  schedulingProduction,
} from "@/lib/crm/scheduling-server";
import { validSessionDay } from "@/lib/crm/scheduling-slots";
import { projectCheckout } from "@/lib/crm/billing-server";
import { enforceCrmPublicRateLimit } from "@/lib/security/crm-public-rate-limit";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
type Context = { params: Promise<{ token: string }> };
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export async function GET(req: Request, { params }: Context) {
  try {
    const limited = await enforceCrmPublicRateLimit(
      req,
      "smart-experience-read",
      120,
      600,
    );
    if (limited) return limited;
    const token = tokenSchema.parse((await params).token),
      day = new URL(req.url).searchParams.get("date");
    const { config } = await experienceFile(token);
    if (day) {
      if (!validSessionDay(day) || !config.session_slug)
        throw new CrmError("Choose a valid date.");
      const type = await readSessionType(config.session_slug);
      return Response.json(
        {
          ...(await sessionAvailability(type, day)),
          type: publicSessionType(type),
        },
        { headers },
      );
    }
    return Response.json(await experienceState(token), { headers });
  } catch (e) {
    return crmError(e);
  }
}
const actionSchema = z.union([
  acceptanceSchema,
  z.object({
    action: z.literal("book"),
    id: z.string().uuid(),
    starts_at: z.string().datetime({ offset: true }),
    phone: z.string().max(50),
    email_consent: z.boolean(),
  }),
  z.object({
    action: z.literal("checkout"),
    installment_id: z.string().uuid(),
  }),
]);
export async function POST(req: Request, { params }: Context) {
  try {
    sameOrigin(req);
    schedulingProduction();
    const limited = await enforceCrmPublicRateLimit(
      req,
      "smart-experience-write",
      30,
      600,
    );
    if (limited) return limited;
    const token = tokenSchema.parse((await params).token),
      body = actionSchema.parse(await readJson(req, 90000));
    if (body.action === "accept")
      return Response.json(await acceptExperience(token, body, req), {
        headers,
      });
    const { file, config } = await experienceFile(token),
      state = await experienceState(token);
    if (!state.acceptance) throw new CrmError("Sign the agreement first.", 409);
    if (body.action === "book") {
      if (!config.session_slug)
        throw new CrmError("This file does not request scheduling.");
      await bookSession(
        config.session_slug,
        {
          ...body,
          full_name: state.acceptance.signer_name,
          email: state.acceptance.signer_email,
          notes: "Booked through the signed project file.",
        },
        token,
      );
      return Response.json({ ok: true }, { headers });
    }
    if (
      config.session_slug &&
      (!state.appointment || state.appointment.status !== "confirmed")
    )
      throw new CrmError(
        "Reserve your session before paying. Contact the office if your session was cancelled.",
        409,
      );
    if (!state.installments.some((i) => i.id === body.installment_id))
      throw new CrmError("Payment unavailable.", 404);
    const accepted = await crmDb()
      .from("crm_file_acceptances")
      .select("invoice_id")
      .eq("file_id", file.id)
      .single();
    if (accepted.error) throw new CrmError("Payment unavailable.", 503);
    const installment = await crmDb()
      .from("crm_billing_installments")
      .select("access_token")
      .eq("invoice_id", accepted.data.invoice_id)
      .eq("id", body.installment_id)
      .single();
    if (installment.error) throw new CrmError("Payment unavailable.", 503);
    return Response.json(
      await projectCheckout(installment.data.access_token, req),
      { headers },
    );
  } catch (e) {
    return crmError(e);
  }
}
