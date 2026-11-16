import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { CrmError, crmDb } from "./server";

export function requireSessionPayments() {
  const stripe = getStripe();
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) throw new CrmError("Photo session payments are temporarily unavailable. Please contact the office.", 503);
  return stripe;
}

export async function settleSessionPayment(session: Stripe.Checkout.Session) {
  const id = session.metadata?.photo_appointment_id;
  if (!id) return;
  const paid = session.mode === "payment" && session.payment_status === "paid";
  if (!paid && session.status !== "expired") return;
  const { error } = await crmDb().rpc("crm_session_payment_result", {
    p_id: id, p_session: session.id, p_amount: session.amount_total,
    p_currency: session.currency, p_paid: paid,
  });
  if (error) throw new CrmError("Payment verification is pending. Please contact the office.", 503);
}

export async function sessionCheckout(id: string): Promise<string | null> {
  const db = crmDb();
  const { data: a, error: ae } = await db.from("crm_appointments").select("id,title,email,manage_token,status,payment_status").eq("id", id).single();
  if (ae || !a) throw new CrmError("Session could not be loaded.", 503);
  if (a.payment_status === "not_required" || a.payment_status === "paid") return null;
  if (a.status !== "pending_payment") throw new CrmError("This checkout has expired. Choose a new time.", 409);
  const stripe = requireSessionPayments();
  const { data: p, error } = await db.from("crm_session_payments").select("*").eq("appointment_id", id).single();
  if (error || !p) throw new CrmError("Checkout is temporarily unavailable.", 503);
  let session: Stripe.Checkout.Session;
  if (p.stripe_session_id) {
    session = await stripe.checkout.sessions.retrieve(p.stripe_session_id);
  } else {
    // Frozen values and key recover an ambiguous provider response without
    // charging twice. Never create a fresh session after this safety window.
    if (Date.parse(p.expires_at) - Date.now() < 31 * 60000) throw new CrmError("Please contact the office to recover this checkout. Your time is still held.", 409);
    const path = `https://app.oceanoblue.net/meet/manage/${a.manage_token}`;
    session = await stripe.checkout.sessions.create({
      mode: "payment", payment_method_types: ["card"], customer_email: a.email,
      client_reference_id: id, metadata: { photo_appointment_id: id },
      payment_intent_data: { metadata: { photo_appointment_id: id } },
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: p.amount_cents, product_data: { name: a.title } } }],
      expires_at: Math.floor(Date.parse(p.expires_at) / 1000),
      success_url: `${path}?payment=returned`, cancel_url: `${path}?payment=cancelled`,
    }, { idempotencyKey: `photo-session-${id}` });
    const saved = await db.from("crm_session_payments").update({ stripe_session_id: session.id, checkout_url: session.url }).eq("appointment_id", id);
    if (saved.error) throw new CrmError("Checkout is being recovered. Please try again.", 503);
  }
  await settleSessionPayment(session);
  if (session.payment_status === "paid") return null;
  if (session.status === "expired") throw new CrmError("This checkout has expired. Choose a new time.", 409);
  if (!session.url) throw new CrmError("Payment is being verified. Refresh your session details shortly.", 409);
  return session.url;
}

export async function reconcileSessionPayments() {
  if (process.env.VERCEL_ENV !== "production") return;
  const { data, error } = await crmDb().from("crm_appointments").select("id").eq("status", "pending_payment").order("created_at", { ascending: false }).limit(10);
  if (error) throw error;
  for (const row of data ?? []) {
    try { await sessionCheckout(row.id); }
    catch { /* Retain uncertain holds; the office can see pending payments. */ }
  }
}
