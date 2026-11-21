import { z } from "zod";
import { crmActor, crmDb, crmError } from "@/lib/crm/server";
import { reviewContext, workflowError } from "@/lib/social/review";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await crmActor();
    const id = z.string().uuid().parse((await params).id);
    const item = await reviewContext(id);
    const db = crmDb();
    const [program, reviews, deliveries] = await Promise.all([
      db.from("social_programs").select("approval_mode,publishing_enabled").eq("id", item.program_id).single(),
      db.from("social_review_events").select("revision,event,actor_name,note,created_at").eq("item_id", id).order("created_at", { ascending: false }).limit(50),
      db.from("social_deliveries").select("platform,state,revision,provider_id,live_url,attempts,updated_at,detail,lease_until")
        .eq("item_id", id).order("updated_at", { ascending: false }).limit(80),
    ]);
    if (program.error) workflowError(program.error);
    if (reviews.error) workflowError(reviews.error);
    if (deliveries.error) workflowError(deliveries.error);
    return Response.json({ ...program.data, reviews: reviews.data, deliveries: deliveries.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return crmError(e); }
}
