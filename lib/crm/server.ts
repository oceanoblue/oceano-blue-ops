import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "@/lib/supabase/server";
export class CrmError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const crmDb = (): SupabaseClient =>
  createAdminClient({ noStore: true }) as unknown as SupabaseClient;
export async function crmActor(): Promise<string> {
  const session = await createClient();
  const {
    data: { user },
    error,
  } = await session.auth.getUser();
  if (error || !user) throw new CrmError("Please sign in.", 401);
  const { data, error: accessError } = await session
    .from("team_members")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (accessError) throw new CrmError("Account access is unavailable.", 503);
  if (!data?.is_active || !["admin", "coordinator"].includes(data.role))
    throw new CrmError("Office access is required.", 403);
  return user.id;
}
export async function readJson(req: Request, max = 90000): Promise<unknown> {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new CrmError("JSON required.", 415);
  if (Number(req.headers.get("content-length") || 0) > max)
    throw new CrmError("Request too large.", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new CrmError("Request body required.");
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new CrmError("Request too large.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CrmError("Invalid request.");
  }
}
export function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    throw new CrmError("Reload the page and try again.", 403);
}
export function crmError(e: unknown): Response {
  if (e instanceof CrmError)
    return Response.json({ error: e.message }, { status: e.status });
  if (e && typeof e === "object" && "issues" in e)
    return Response.json(
      { error: "Check the form fields.", issues: e.issues },
      { status: 400 },
    );
  console.error("[crm]", e instanceof Error ? e.message : "unexpected_error");
  return Response.json(
    { error: "Unable to complete the request. Please retry." },
    { status: 503 },
  );
}
export async function crmRead(
  page = 0,
  filters: {
    query?: string;
    tag?: string;
    stage?: string;
    owner?: string;
  } = {},
) {
  const db = crmDb();
  const queries = await Promise.all([
    db.rpc("crm_page", {
      p_query: filters.query || "",
      p_tag: filters.tag || "",
      p_stage: filters.stage || null,
      p_owner: filters.owner || null,
      p_page: page,
    }),
    db.from("crm_stages").select("*").order("position").order("id"),
    db
      .from("crm_tasks")
      .select("*")
      .order("completed_at", { ascending: false, nullsFirst: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(300),
    db.from("crm_forms").select("*").order("created_at"),
    db
      .from("crm_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("crm_automations").select("*").order("created_at"),
    db
      .from("team_members")
      .select("id,full_name")
      .eq("is_active", true)
      .in("role", ["admin", "coordinator"])
      .order("full_name"),
  ]);
  if (queries.some((r) => r.error))
    throw new CrmError(
      "CRM is unavailable. Confirm the CRM database migration has been applied.",
      503,
    );
  const [listing, stages, tasks, forms, events, automations, team] =
    queries.map((r) => r.data ?? []);
  const contacts = listing.contacts ?? [],
    deals = listing.deals ?? [];
  return {
    tags: listing.tags ?? [],
    contacts: contacts.slice(0, 100),
    deals: deals.slice(0, 100),
    stages,
    tasks,
    forms,
    events,
    automations,
    team,
    page,
    hasMore: contacts.length > 100 || deals.length > 100,
  };
}
