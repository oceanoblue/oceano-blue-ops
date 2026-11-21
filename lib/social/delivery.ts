import { z } from "zod";
import { CrmError, crmDb } from "@/lib/crm/server";
import { auditMonth } from "./audit";
import { listPrograms, loadWorkspace, type Account, type Item } from "./server";
import { PLATFORMS, todayKey, type Platform } from "./schema";
import { workflowError } from "./review";

const uuid = z.string().uuid();
const claim = z.object({ action: z.literal("claim"), id: uuid, client: uuid, revision: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), platform: z.enum(PLATFORMS), mode: z.enum(["test", "live"]).default("test") });
const receipt = z.object({ action: z.literal("receipt"), idempotency_key: uuid, claim_id: uuid,
  event: z.enum(["scheduled", "published", "failed", "uncertain"]), provider_id: z.string().trim().max(250).default(""),
  published_url: z.union([z.literal(""), z.url({protocol: /^https$/}).max(500)]).default(""), detail: z.string().trim().max(1000).default("") });
export const bridgeAction = z.discriminatedUnion("action", [claim, receipt]);
export type Receipt = z.infer<typeof receipt>;
export type Claim = z.infer<typeof claim>;
export type DestinationState = { item_id: string; revision: number; platform: Platform; state: string; detail: string; updated_at: string; live_url: string };

async function queue(programId: string, month: string) {
  const [programs, workspace] = await Promise.all([listPrograms(), loadWorkspace(programId, month)]);
  const program = programs.find(p => p.id === programId);
  if (!program) throw new CrmError("Client unavailable.", 404);
  const audit = auditMonth(workspace.items, workspace.accounts, program.avoid_terms, todayKey());
  const accounts = new Map(workspace.accounts.map(a => [a.id, a]));
  const items = workspace.items.filter(i => ["approved", "scheduled"].includes(i.status));
  const records: DestinationState[] = [];
  const db = crmDb();
  for (let offset = 0; offset < items.length; offset += 80) {
    const rows = await db.from("social_deliveries").select("item_id,revision,platform,state,detail,updated_at,live_url")
      .in("item_id", items.slice(offset, offset + 80).map(i => i.id));
    if (rows.error) workflowError(rows.error);
    records.push(...rows.data as DestinationState[]);
  }
  const scopes = new Map(workspace.entitlements.map(row => [row.account_id, row]));
  const candidates: { id: string; revision: number; platform: Platform }[] = [];
  const held: { id: string; platform?: Platform; issues: string[] }[] = [];
  for (const item of items) {
    const account = accounts.get(item.account_id);
    const issues = (audit[item.id] ?? []).filter(issue => issue.severity === "error").map(issue => issue.message);
    const scope = scopes.get(item.account_id);
    const quota = scope && (item.kind === "google_post" ? scope.google_posts_per_month : item.kind === "reel" ? scope.reels_per_month : scope.posts_per_month);
    if (!quota || item.slot > quota) issues.push("Outside the contracted monthly scope.");
    if (program.status !== "active" || !account?.is_active) issues.push("Client or account is inactive.");
    if (account?.access_status !== "connected") issues.push("Publishing access is unconfirmed.");
    if (!item.review_revision || item.approved_revision !== item.review_revision || item.approved_by_role !== (program.approval_mode === "office" ? "office" : "client"))
      issues.push("The current revision needs authorization.");
    if (!item.publish_time || !account?.publishing_timezone) issues.push("Set the local publish time and property timezone.");
    if (!item.creative_path) issues.push("Attach the final creative.");
    const platforms = account?.platforms.filter(p => (item.kind === "google_post") === (p === "google")) ?? [];
    if (!platforms.length) issues.push("No destination is selected.");
    if (issues.length || !account) { held.push({ id: item.id, issues }); continue; }
    for (const platform of new Set(platforms)) {
      if (!account.provider_destinations?.[platform]?.trim()) { held.push({ id: item.id, platform, issues: ["Provider profile ID missing."] }); continue; }
      const conflict = records.find(row => row.item_id === item.id && row.platform === platform && row.state !== "failed");
      if (conflict) { held.push({ id: item.id, platform, issues: [`Delivery is ${conflict.state}. Check its provider receipt.`] }); continue; }
      candidates.push({ id: item.id, platform, revision: item.review_revision! });
    }
  }
  return { program, candidates, held, items, accounts };
}

export async function discoverDeliveries(client: string, month: string) {
  const { program, candidates, held } = await queue(client, month);
  return { protocol: 2, program: program.name, month, ready: [], candidates, held };
}

export async function claimDelivery(input: Claim) {
  const dry = input.mode !== "live";
  if (!dry && (process.env.VERCEL_ENV !== "production" || process.env.SOCIAL_PUBLISHING_ENABLED !== "true"))
    throw new CrmError("Live handoff is disabled. Use test mode.", 403);
  const q = await queue(input.client, input.month);
  if (!q.candidates.some(c => c.id === input.id && c.platform === input.platform && c.revision === input.revision))
    throw new CrmError("This destination is held. Refresh the queue to see why.", 409);
  const item = q.items.find(i => i.id === input.id) as Item;
  const account = q.accounts.get(item.account_id) as Account;
  const db = crmDb();
  const signed = !dry && await db.storage.from("social-creative").createSignedUrl(item.creative_path!, 3600);
  if (signed && !signed.data) throw new CrmError("Creative unavailable. Try again.", 503);
  const { data, error } = await db.rpc("social_claim_delivery", { p_program: input.client, p_item: input.id,
    p_revision: input.revision, p_platform: input.platform, p_account_updated: account.updated_at,
    p_program_updated: q.program.updated_at, p_dry: dry });
  if (error) workflowError(error);
  const { creative_path: _path, ...response } = data;
  return signed ? { ...response, creative_url: signed.data!.signedUrl } : response;
}

export async function recordReceipt(input: Receipt) {
  if (process.env.VERCEL_ENV !== "production") throw new CrmError("Record provider receipts on the live system.", 403);
  const { data, error } = await crmDb().rpc("social_record_receipt", { p_key: input.idempotency_key, p_claim: input.claim_id,
    p_event: input.event, p_provider: input.provider_id, p_url: input.published_url, p_detail: input.detail });
  if (error) workflowError(error);
  return data;
}
