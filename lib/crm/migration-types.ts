import { z } from "zod";
import { safeLink } from "./acquisition-types";
const uuid = z.string().uuid();
const date = z.string().date();
const time = z.string().datetime({ offset: true });
export const migrationStates = ["pending", "active", "history", "resolved"] as const;
export const migrationKinds = ["project", "payment", "appointment", "settings"] as const;
const reviewFields = {
  review_state: z.enum(migrationStates),
  priority: z.enum(["urgent", "normal"]),
  next_action: z.string().trim().max(4000),
  owner_id: uuid.nullable(),
  follow_up_at: time.nullable(),
  linked_ops_project: uuid.nullable(),
};
export const observationSchema = z.object({
  source_system: z.string().trim().min(1).max(80),
  source_kind: z.enum(migrationKinds),
  source_id: z.string().trim().min(1).max(240),
  source_url: z.union([z.literal(""), safeLink]).default(""),
  title: z.string().trim().min(1).max(240),
  observed_at: time,
  project_date: date.nullable().default(null),
  starts_at: time.nullable().default(null),
  ends_at: time.nullable().default(null),
  facts: z.record(z.unknown()).refine(v => new TextEncoder().encode(JSON.stringify(v)).length <= 60000, "Source facts are too large."),
  flags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  review_state: reviewFields.review_state.default("pending"),
  priority: reviewFields.priority.default("normal"),
  next_action: reviewFields.next_action.default(""),
  owner_id: reviewFields.owner_id.default(null),
  follow_up_at: reviewFields.follow_up_at.default(null),
  linked_ops_project: reviewFields.linked_ops_project.default(null),
}).refine(v => !v.ends_at || (!!v.starts_at && Date.parse(v.ends_at) > Date.parse(v.starts_at)), "End time must follow start time.");
export const migrationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import"), id: uuid, data: z.object({ records: z.array(observationSchema).min(1).max(200) }) }),
  z.object({ action: z.literal("review"), id: uuid, version: z.number().int().min(1), data: z.object({ ...reviewFields, reason: z.string().trim().min(1).max(2000) }) }),
]);
export const migrationFiltersSchema = z.object({
  query: z.string().trim().max(120).default(""),
  page: z.coerce.number().int().min(0).max(100000).default(0),
  year: z.coerce.number().int().min(2000).max(2100).nullable().default(null),
  status: z.enum(["all", "unresolved", ...migrationStates]).default("unresolved"),
  kind: z.enum(["all", ...migrationKinds]).default("all"),
});
export type MigrationFilters = z.infer<typeof migrationFiltersSchema>;
export type MigrationReview = { id: string; reason: string; actor_name: string | null; created_at: string; review_state: string; next_action: string };
export type MigrationObservation = z.infer<typeof observationSchema> & { id: string; version: number; updated_at: string; reviews: MigrationReview[] };
export type MigrationData = {
  observations: MigrationObservation[];
  total: number;
  page: number;
  page_size: number;
  counts: { total: number; pending: number; active: number; history: number; resolved: number; urgent: number; overdue: number; unassigned: number };
  owners: { id: string; full_name: string }[];
  production: boolean;
};
export function factLabel(key: string) { return key.replace(/[_-]+/g, " ").replace(/^./, c => c.toUpperCase()); }
export function factText(value: unknown, depth = 0): string {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value !== "object") return String(value).slice(0, 3000);
  if (depth > 2) return "Additional source details recorded";
  if (Array.isArray(value)) return value.map(v => factText(v, depth + 1)).join(" · ").slice(0, 3000) || "None recorded";
  return Object.entries(value).map(([key, v]) => `${factLabel(key)}: ${factText(v, depth + 1)}`).join("; ").slice(0, 3000) || "No details recorded";
}
