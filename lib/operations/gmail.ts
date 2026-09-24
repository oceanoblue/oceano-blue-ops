import { encryptionConfigured } from "@/lib/google-calendar/token-encryption";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { getAccessToken } from "@/lib/google-calendar/api";
import type { InboxMessage, InboxSnapshot } from "./types";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_READ = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_DRAFT = "https://www.googleapis.com/auth/gmail.compose";
const id = z.string().min(1).max(150).regex(/^[a-zA-Z0-9_-]+$/);
export const draftSchema = z.object({
  to: z.string().max(254).email().regex(/^[^\r\n]+$/),
  subject: z.string().trim().min(1).max(250).regex(/^[^\r\n]+$/),
  body: z.string().trim().min(1).max(12000),
  sourceId: id.optional(),
  draftId: id.optional(),
});

export function mailboxAddress(value: string) {
  const match = value.match(/<([^<>]+)>/);
  const candidate = (match?.[1] ?? value).trim();
  return z.string().email().safeParse(candidate).success && !/[\r\n]/.test(candidate) ? candidate : "";
}

export async function gmailAccess(userId: string, write = false) {
  if (process.env.GMAIL_INTEGRATION_ENABLED !== "true" || !encryptionConfigured()) throw new Error("Connect Gmail after the security setup is complete. Email access is currently disabled.");
  if (write && process.env.GMAIL_DRAFTS_ENABLED !== "true") throw new Error("Gmail draft saving is disabled. Copy your draft into Gmail instead.");
  const db = createAdminClient({ noStore: true });
  const { data, error } = await db.from("team_calendar_connections")
    .select("scope,is_active,account_email").eq("team_member_id", userId)
    .eq("provider", "google").maybeSingle();
  if (error) throw new Error("Gmail connection could not be checked.");
  const scopes = data?.scope?.split(/\s+/) ?? [];
  if (!data?.is_active || !scopes.includes(GMAIL_READ) || (write && !scopes.includes(GMAIL_DRAFT)))
    throw new Error("Connect Gmail in Integrations and approve inbox and draft access.");
  const token = await getAccessToken(userId);
  if (!token) throw new Error("Reconnect Google to refresh Gmail access.");
  return { token, account: data.account_email, canDraft: process.env.GMAIL_DRAFTS_ENABLED === "true" && scopes.includes(GMAIL_DRAFT) };
}

async function gmailFetch(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE}/${path}`, {
    ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Gmail request failed (${response.status}). Check the connection and Gmail API access.`);
  return response.json();
}

type GmailMessage = {
  id: string; threadId: string; snippet?: string; internalDate?: string; labelIds?: string[];
  payload?: { headers?: { name: string; value: string }[] };
};
export function normalizeMessage(message: GmailMessage, account: string | null): InboxMessage {
  const header = (name: string) => message.payload?.headers?.find(h => h.name.toLowerCase() === name)?.value ?? "";
  const timestamp = Number(message.internalDate);
  return {
    id: message.id, threadId: message.threadId, subject: header("subject").slice(0, 250) || "(No subject)",
    from: header("from").slice(0, 300), replyTo: mailboxAddress(header("reply-to") || header("from")),
    snippet: (message.snippet ?? "").slice(0, 1000),
    receivedAt: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : "",
    unread: message.labelIds?.includes("UNREAD") ?? false,
    href: `https://mail.google.com/mail/?${new URLSearchParams(account ? { authuser: account } : {})}#all/${encodeURIComponent(message.threadId)}`,
  };
}

export async function getInboxMessage(token: string, messageId: string, account: string | null) {
  id.parse(messageId);
  const params = new URLSearchParams({ format: "metadata" });
  ["From", "Reply-To", "Subject", "Message-ID", "References"].forEach(h => params.append("metadataHeaders", h));
  const raw: GmailMessage = await gmailFetch(token, `messages/${encodeURIComponent(messageId)}?${params}`);
  return { raw, message: normalizeMessage(raw, account) };
}

export async function loadInbox(userId: string): Promise<InboxSnapshot> {
  let access;
  try { access = await gmailAccess(userId); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Gmail unavailable.";
    return { status: message.startsWith("Connect Gmail") ? "disconnected" : "error", message, account: null, canDraft: false, messages: [] };
  }
  try {
    const params = new URLSearchParams({ q: "in:inbox newer_than:14d -category:promotions -category:social", maxResults: "20" });
    const data = await gmailFetch(access.token, `messages?${params}`);
    // Four requests at a time; keep partial results visibly partial.
    const messages: InboxMessage[] = [];
    let failed = 0;
    const refs: { id: string }[] = data.messages ?? [];
    for (let start = 0; start < refs.length; start += 4) {
      const batch = await Promise.allSettled(refs.slice(start, start + 4).map(m => getInboxMessage(access.token, m.id, access.account)));
      for (const result of batch) {
        if (result.status === "fulfilled") messages.push(result.value.message);
        else failed++;
      }
    }
    messages.sort((a,b) => b.receivedAt.localeCompare(a.receivedAt));
    return {
      status: failed ? "error" : "connected", account: access.account, canDraft: access.canDraft, messages,
      message: `${messages.length} recent inbox messages · last 14 days · previews only.${data.nextPageToken ? " Limited to the 20 most recent messages." : ""}${failed ? ` ${failed} messages could not be loaded.` : ""} Promotions, social mail, attachments and full threads are not included.`,
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Gmail unavailable.", account: access.account, canDraft: access.canDraft, messages: [] };
  }
}

export function encodeDraft(draft: z.infer<typeof draftSchema>, replyHeaders: string[] = []) {
  const value = draftSchema.parse(draft);
  // Encode all non-ASCII content; header values cannot inject additional recipients.
  const subject = Array.from(value.subject).reduce<string[]>((chunks, character) => {
    if (!chunks.length || Buffer.byteLength(chunks[chunks.length - 1] + character) > 42) chunks.push(character);
    else chunks[chunks.length - 1] += character;
    return chunks;
  }, []).map(chunk => `=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`).join("\r\n ");
  const body = Buffer.from(value.body).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  return Buffer.from([
    `To: ${value.to}`, `Subject: ${subject}`, ...replyHeaders,
    "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64", "", body,
  ].join("\r\n")).toString("base64url");
}

export async function saveGmailDraft(userId: string, draft: z.infer<typeof draftSchema>) {
  const access = await gmailAccess(userId, true);
  let threadId: string | undefined;
  const replyHeaders: string[] = [];
  if (draft.sourceId) {
    const { raw, message } = await getInboxMessage(access.token, draft.sourceId, access.account);
    const originalId = raw.payload?.headers?.find(h => h.name.toLowerCase() === "message-id")?.value;
    // Only thread actual replies; changed subjects become new conversations.
    if (originalId && /^<[^<>\s]+@[^<>\s]+>$/.test(originalId) && draft.subject.replace(/^re:\s*/i, "") === message.subject.replace(/^re:\s*/i, "")) {
      threadId = message.threadId;
      replyHeaders.push(`In-Reply-To: ${originalId}`, `References: ${originalId}`);
    }
  }
  const saved = await gmailFetch(access.token, `drafts${draft.draftId ? `/${encodeURIComponent(draft.draftId)}` : ""}`, {
    method: draft.draftId ? "PUT" : "POST",
    body: JSON.stringify({ message: { raw: encodeDraft(draft, replyHeaders), ...(threadId ? { threadId } : {}) } }),
  });
  if (!id.safeParse(saved.id).success) throw new Error("Gmail returned an incomplete result. Check Gmail Drafts before trying again.");
  return { id: saved.id as string, href: `https://mail.google.com/mail/?${new URLSearchParams(access.account ? { authuser: access.account } : {})}#drafts` };
}
