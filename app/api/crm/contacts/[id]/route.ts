import { z } from "zod";
import { crmActor, crmDb, crmError, CrmError } from "@/lib/crm/server";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await crmActor();
    const id = z
        .string()
        .uuid()
        .parse((await params).id),
      db = crmDb();
    const results = await Promise.all([
      db
        .from("clients")
        .select(
          "id,full_name,email,phone,billing_address,brokerage,notes,crm_contact_profiles(company,tags,status,version)",
        )
        .eq("id", id)
        .maybeSingle(),
      db
        .from("crm_opportunities")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("crm_events")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("crm_submissions")
        .select("id,answers,form_snapshot,attribution,created_at,project_id")
        .eq("client_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("crm_tasks")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("orders")
        .select(
          "id,order_number,status,total_cents,download_paid_at,created_at",
        )
        .eq("client_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("jobs")
        .select("id,title,status")
        .eq("client_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (results.some((r) => r.error))
      throw new CrmError("Contact history could not be loaded.", 503);
    if (!results[0].data) throw new CrmError("Contact not found.", 404);
    const [contact, deals, events, submissions, tasks, orders, jobs] =
      results.map((r) => r.data);
    return Response.json(
      { contact, deals, events, submissions, tasks, orders, jobs },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return crmError(e);
  }
}
