import { createHash } from "node:crypto";
import { publicFile } from "./acquisition-server";
import { mergeText, validateFileAnswers } from "./acquisition-types";
import {
  acceptanceSchema,
  priceSelection,
  signingConsent,
  type ExperienceState,
} from "./smart-experience-types";
import { crmDb, CrmError } from "./server";
import { clientIp } from "@/lib/security/rate-limit";
export async function experienceFile(token: string) {
  const file = await publicFile(token);
  const config = file?.document.blocks.find((b) => b.kind === "experience");
  if (!file || !config || config.kind !== "experience")
    throw new CrmError("Booking file unavailable.", 404);
  return { file, config };
}
export async function experienceState(token: string): Promise<ExperienceState> {
  const { file } = await experienceFile(token),
    db = crmDb();
  const { data: accepted, error } = await db
    .from("crm_file_acceptances")
    .select(
      "package_id,addon_ids,signer_name,signer_email,accepted_at,total_cents,deposit_cents,document_hash,answers,agreement,consent_text,invoice_id",
    )
    .eq("file_id", file.id)
    .maybeSingle();
  if (error)
    throw new CrmError(
      "Your booking progress is temporarily unavailable.",
      503,
    );
  if (!accepted)
    return {
      acceptance: null,
      appointment: null,
      installments: [],
      payment_review: false,
    };
  const [booking, installments, invoice] = await Promise.all([
    db
      .from("crm_file_bookings")
      .select("appointment_id")
      .eq("file_id", file.id)
      .maybeSingle(),
    db
      .from("crm_billing_installments")
      .select("id,title,amount_cents,paid_cents,due_date")
      .eq("invoice_id", accepted.invoice_id)
      .order("due_date"),
    db
      .from("crm_billing_invoices")
      .select("payment_review_required,reconciliation")
      .eq("id", accepted.invoice_id)
      .single(),
  ]);
  if (booking.error || installments.error || invoice.error)
    throw new CrmError(
      "Your booking progress is temporarily unavailable.",
      503,
    );
  let appointment = null;
  if (booking.data) {
    const result = await db
      .from("crm_appointments")
      .select("id,starts_at,status,manage_token")
      .eq("id", booking.data.appointment_id)
      .single();
    if (result.error)
      throw new CrmError("Your appointment is temporarily unavailable.", 503);
    appointment = result.data;
  }
  const { invoice_id: _invoice, ...acceptance } = accepted;
  return {
    acceptance,
    appointment,
    installments: installments.data ?? [],
    payment_review:
      invoice.data.payment_review_required ||
      invoice.data.reconciliation !== "verified",
  };
}
export async function acceptExperience(
  token: string,
  input: unknown,
  req: Request,
) {
  const { file, config } = await experienceFile(token),
    body = acceptanceSchema.parse(input);
  priceSelection(config, body.package_id, body.addon_ids);
  const answers = validateFileAnswers(file.document, body.answers);
  const payload = { ...body, addon_ids: [...body.addon_ids].sort(), answers };
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const { data, error } = await crmDb().rpc("crm_file_accept", {
    p_token: token,
    p_data: {
      ...payload,
      agreement: mergeText(config.terms, file.context),
      consent_text: signingConsent,
      document_hash: hash(
        JSON.stringify({ snapshot: file.snapshot, context: file.context }),
      ),
      payload_hash: hash(JSON.stringify(payload)),
      ip_hash: hash(clientIp(req)),
      user_agent: req.headers.get("user-agent") ?? "",
    },
  });
  if (error)
    throw new CrmError("Your agreement could not be saved. Please retry.", 503);
  if (data?.error) throw new CrmError(data.error, 409);
  return { ok: true };
}
