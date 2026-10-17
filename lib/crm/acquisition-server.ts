import { crmDb, CrmError } from "./server";
import {
  defaultFrom,
  defaultReplyTo,
  isEmailConfigured,
} from "@/lib/email/resend";
import {
  fileTemplateSchema,
  type AcquisitionData,
  type FileContext,
} from "./acquisition-types";
export const appBase = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "https://app.oceanoblue.net").replace(
    /\/$/,
    "",
  );
export async function acquisitionProjects(query = "", clientId?: string) {
  const db = crmDb();
  let projects = db
    .from("crm_opportunities")
    .select(
      "id,title,project_type,clients(full_name,email),crm_stages!inner(outcome)",
    )
    .in("crm_stages.outcome", ["open", "won"])
    .order("updated_at", { ascending: false })
    .limit(100);
  if (clientId) projects = projects.eq("client_id", clientId);
  if (query)
    projects = projects.ilike("title", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
  return await projects;
}
export async function acquisitionRead(
  query = "",
  clientId?: string,
): Promise<AcquisitionData> {
  const db = crmDb();
  let jobQuery = db
    .from("crm_acquisition_jobs")
    .select(
      "id,project_id,client_id,sequence_id,status,due_at,subject,body,context,recipient,file_id,attempts,provider_id,last_error,first_attempt_at,created_at,accepted_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  let issuedQuery = db
    .from("crm_issued_files")
    .select(
      "id,project_id,client_id,title,context,created_at,expires_at,viewed_at,responded_at,revoked_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (clientId) {
    jobQuery = jobQuery.eq("client_id", clientId);
    issuedQuery = issuedQuery.eq("client_id", clientId);
  }
  const result = await Promise.all([
    db.from("crm_message_templates").select("*").order("created_at").limit(100),
    db.from("crm_file_templates").select("*").order("created_at").limit(100),
    db.from("crm_sequences").select("*").order("created_at").limit(100),
    db
      .from("crm_forms")
      .select("id,name,published")
      .order("created_at")
      .limit(100),
    jobQuery,
    issuedQuery,
    acquisitionProjects(query, clientId),
  ]);
  if (result.some((r) => r.error))
    throw new CrmError(
      "Acquisition workspace is temporarily unavailable.",
      503,
    );
  const [messages, files, sequences, forms, jobs, issued, rows] = result.map(
    (r) => r.data ?? [],
  );
  return {
    messages,
    files,
    sequences,
    forms,
    jobs,
    issued,
    projects: rows,
    email: {
      configured: isEmailConfigured(),
      sendingEnabled: process.env.VERCEL_ENV === "production",
      from: defaultFrom(),
      replyTo: defaultReplyTo(),
    },
  } as unknown as AcquisitionData;
}
export async function publicFile(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const { data, error } = await crmDb()
    .from("crm_issued_files")
    .select("id,title,snapshot,context,expires_at,responded_at")
    .eq("access_token", token)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new CrmError("This file is temporarily unavailable.", 503);
  if (!data) return null;
  return {
    ...data,
    document: {
      ...fileTemplateSchema.parse(data.snapshot),
      name: data.title,
      ready: true,
    },
    context: data.context as FileContext,
  };
}
