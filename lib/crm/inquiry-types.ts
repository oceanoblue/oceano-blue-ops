import { z } from "zod";
const uuid = z.string().uuid();
const note = z.string().trim().min(1).max(2000);
export const inquiryFiltersSchema = z.object({
  query: z.string().trim().max(120).default(""),
  status: z.enum(["due", "unanswered", "snoozed", "answered", "dismissed", "closed", "all"]).default("unanswered"),
  page: z.coerce.number().int().min(0).max(100000).default(0),
});
export type InquiryFilters = z.infer<typeof inquiryFiltersSchema>;
export const replyContentSchema = z.object({
  subject: z.string().trim().min(1).max(200).refine(v => !/[\r\n]/.test(v), "Use one subject line."),
  body: z.string().trim().min(1).max(10000),
});
export const inquiryActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("draft"), id: uuid }),
  z.object({ action: z.literal("enroll_project"), id: uuid, data: z.object({ message: z.string().trim().min(1).max(10000), source: z.string().trim().min(1).max(200), received_at: z.string().datetime({ offset: true }), note }) }),
  z.object({ action: z.literal("snooze"), id: uuid, version: z.number().int().min(1), data: z.object({ until: z.string().datetime({ offset: true }), note }) }),
  z.object({ action: z.literal("answered"), id: uuid, version: z.number().int().min(1), data: z.object({ channel: z.enum(["email", "phone", "meeting", "other"]), note }) }),
  z.object({ action: z.literal("dismiss"), id: uuid, version: z.number().int().min(1), data: z.object({ note }) }),
  z.object({ action: z.literal("reopen"), id: uuid, version: z.number().int().min(1), data: z.object({ note }) }),
  z.object({ action: z.literal("send_reply"), id: uuid, version: z.number().int().min(1), data: replyContentSchema.extend({ request_id: uuid }) }),
]);
export type InquiryItem = {
  id: string; project_id: string; client_id: string; submission_id: string | null;
  title: string; client_name: string; client_email: string; project_type: string;
  project_date: string | null; message: string; source: string; received_at: string;
  state: "open" | "snoozed" | "answered" | "dismissed";
  closed: boolean; due_at: string; snoozed_until: string | null;
  answered_at: string | null; response_channel: string | null; response_note: string;
  owner_id: string | null; owner_name: string | null; version: number;
  reply_job_id: string | null; reply_status: string | null;
  answers: { key: string; label: string; value: unknown }[];
  history: { action: string; note: string; actor_name: string | null; created_at: string }[];
};
export type InquiryDraft = { subject: string; body: string; source: "ai" | "template"; model: string | null; cautions: string[]; inquiry_version: number };
export type InquiryData = {
  inquiries: InquiryItem[]; total: number; page: number; page_size: number;
  counts: { total: number; due: number; unanswered: number; snoozed: number; answered: number; dismissed: number; closed: number };
  notifications: { queued: number; needs_review: number; blocked: number; accepted: number };
  production: boolean;
  email: { configured: boolean; officeNotificationsEnabled: boolean; officeRecipient: string | null };
};
