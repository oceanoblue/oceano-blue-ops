import { CrmError, crmDb } from "@/lib/crm/server";

export function workflowError(error: { code?: string; message: string }): never {
  if (error.code === "P0001") throw new CrmError(error.message, 409);
  if (error.code === "P0002") throw new CrmError("That piece or account is unavailable.", 404);
  throw new CrmError("Social Studio could not save the change. Try again.", 503);
}

export async function reviewContext(id: string) {
  const db = crmDb();
  const item = await db.from("social_content_items").select("account_id,month,title,status").eq("id", id).maybeSingle();
  if (item.error) workflowError(item.error);
  if (!item.data) throw new CrmError("That piece was not found.", 404);
  const account = await db.from("social_accounts").select("program_id").eq("id", item.data.account_id).maybeSingle();
  if (account.error) workflowError(account.error);
  if (!account.data) throw new CrmError("That account was not found.", 404);
  return { ...item.data, program_id: account.data.program_id as string };
}

export async function reviewItems(input: {
  program: string; account: string; month: string; items: { id: string; revision: number }[];
  role: "client" | "office"; actor: string | null; name: string; token: string | null;
  event: "approved" | "changes" | "handled"; note: string;
}) {
  const { data, error } = await crmDb().rpc("social_review_items", {
    p_program: input.program, p_account: input.account, p_month: input.month, p_items: input.items,
    p_role: input.role, p_actor: input.actor, p_name: input.name, p_token: input.token, p_event: input.event, p_note: input.note,
  });
  if (error) workflowError(error);
  return Number(data);
}
