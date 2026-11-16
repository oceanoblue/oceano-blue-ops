import { appointmentByToken, schedulingProduction } from "@/lib/crm/scheduling-server";
import { sessionTokenSchema } from "@/lib/crm/scheduling-types";
import { crmError, sameOrigin } from "@/lib/crm/server";
import { sessionCheckout } from "@/lib/crm/session-payments";
import { enforceCrmPublicRateLimit } from "@/lib/security/crm-public-rate-limit";
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    sameOrigin(req); schedulingProduction();
    const limited = await enforceCrmPublicRateLimit(req, "session-payment", 30, 3600); if (limited) return limited;
    const token = sessionTokenSchema.parse((await params).token);
    const appointment = await appointmentByToken(token);
    const checkout_url = await sessionCheckout(appointment.id);
    return Response.json({ checkout_url, confirmed: !checkout_url }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (e) { return crmError(e); }
}
