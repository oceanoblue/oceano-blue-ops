import { z } from "zod";

// ---------------------------------------------------------------------------
// Vocabulary. The database check constraints in
// supabase/migrations/20261118130000_social_studio.sql list the same values.
// ---------------------------------------------------------------------------

export const PLATFORMS = ["facebook", "instagram", "linkedin", "google", "x", "youtube", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  google: "Google",
  x: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
};

export const TIERS = ["standard", "high_volume", "corporate"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_LABEL: Record<Tier, string> = {
  standard: "Standard",
  high_volume: "High volume",
  corporate: "Corporate",
};
/** Starting quota for a new account of each tier. Every number can be edited per account. */
export const TIER_DEFAULTS: Record<
  Tier,
  { posts_per_month: number; reels_per_month: number; google_posts_per_month: number; platforms: Platform[] }
> = {
  standard: { posts_per_month: 5, reels_per_month: 1, google_posts_per_month: 0, platforms: ["facebook", "instagram"] },
  // Three posts a week is about 13 a month.
  high_volume: { posts_per_month: 13, reels_per_month: 2, google_posts_per_month: 0, platforms: ["facebook", "instagram"] },
  corporate: { posts_per_month: 8, reels_per_month: 2, google_posts_per_month: 2, platforms: [...PLATFORMS] },
};

export const KINDS = ["post", "reel", "google_post"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { post: "Post", reel: "Reel", google_post: "Google post" };

export const PILLARS = ["property_feature", "local_event", "local_story", "flexible", "video", "google_update"] as const;
export type Pillar = (typeof PILLARS)[number];
export const PILLAR_LABEL: Record<Pillar, string> = {
  property_feature: "Property feature",
  local_event: "Local event",
  local_story: "Local story",
  flexible: "Flexible",
  video: "Video",
  google_update: "Google update",
};
/** The order posts rotate through, so five posts give 2 property, 1 event, 1 story, 1 flexible. */
const POST_ROTATION: Pillar[] = ["property_feature", "local_event", "property_feature", "local_story", "flexible"];

export const STATUSES = [
  "planned",
  "needs_media",
  "in_design",
  "internal_review",
  "client_review",
  "approved",
  "scheduled",
  "published",
] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = {
  planned: "Planned",
  needs_media: "Needs media",
  in_design: "In design",
  internal_review: "Our review",
  client_review: "Client review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
};
export const STATUS_PILL: Record<Status, string> = {
  planned: "bg-slate-100 text-slate-700",
  needs_media: "bg-rose-100 text-rose-700",
  in_design: "bg-fuchsia-100 text-fuchsia-700",
  internal_review: "bg-amber-100 text-amber-800",
  client_review: "bg-cyan-100 text-cyan-800",
  approved: "bg-indigo-100 text-indigo-700",
  scheduled: "bg-blue-100 text-blue-700",
  published: "bg-emerald-100 text-emerald-700",
};
export const STATUS_BAR: Record<Status, string> = {
  planned: "bg-slate-300",
  needs_media: "bg-rose-400",
  in_design: "bg-fuchsia-400",
  internal_review: "bg-amber-400",
  client_review: "bg-cyan-400",
  approved: "bg-indigo-400",
  scheduled: "bg-blue-500",
  published: "bg-emerald-500",
};
/** A piece counts as done for the month once it is scheduled or live. */
export const DONE: readonly Status[] = ["scheduled", "published"];
export const IN_PRODUCTION: readonly Status[] = ["needs_media", "in_design", "internal_review"];

export const PROGRAM_STATUSES = ["prospect", "onboarding", "active", "paused", "ended"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];
export const ACCESS_STATUSES = ["pending", "connected", "issue"] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];
export const ACCESS_LABEL: Record<AccessStatus, string> = {
  pending: "Access pending",
  connected: "Connected",
  issue: "Access issue",
};
export const ACCESS_PILL: Record<AccessStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  connected: "bg-emerald-100 text-emerald-700",
  issue: "bg-rose-100 text-rose-700",
};
export const MEDIA_SOURCES = ["client_visit", "property", "oceano_shoot", "stock"] as const;
export type MediaSource = (typeof MEDIA_SOURCES)[number];
export const MEDIA_SOURCE_LABEL: Record<MediaSource, string> = {
  client_visit: "Client's hotel visit",
  property: "Sent by the property",
  oceano_shoot: "Oceano Blue Media shoot",
  stock: "Stock",
};
export const REQUEST_STATUSES = ["open", "sent", "received", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_LABEL: Record<RequestStatus, string> = {
  open: "To send",
  sent: "Sent to client",
  received: "Received",
  cancelled: "Cancelled",
};

// ---------------------------------------------------------------------------
// Months. A month is written "2027-01" in URLs and "2027-01-01" in the database.
// ---------------------------------------------------------------------------

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const BUSINESS_TZ = process.env.NEXT_PUBLIC_BUSINESS_TZ || "America/New_York";

/** Today's calendar date in the business timezone, as YYYY-MM-DD. */
export function todayKey(now: Date = new Date(), tz: string = BUSINESS_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** The month in the URL if it is valid, otherwise the current month. */
export function parseMonth(value: unknown, now: Date = new Date()): string {
  return typeof value === "string" && MONTH_RE.test(value) ? value : todayKey(now).slice(0, 7);
}
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export const monthStart = (month: string) => `${month}-01`;
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}
/** "Jan 14" for a YYYY-MM-DD date. */
export function shortDate(date: string | null): string {
  if (!date) return "No date";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export type Quota = { posts_per_month: number; reels_per_month: number; google_posts_per_month: number };
export type PlannedSlot = { kind: Kind; slot: number; pillar: Pillar; scheduled_for: string };

/**
 * Spread `count` pieces evenly across the month. `offset` shifts the whole run
 * by a few days (never past the gap between two pieces), so accounts with the
 * same quota do not all land on the same dates.
 */
function spread(month: string, count: number, index: number, offset: number): string {
  const days = daysInMonth(month);
  const gap = Math.max(1, Math.floor(days / count));
  const day = Math.min(days, Math.floor((index * days) / count) + (offset % gap) + 1);
  return `${month}-${String(day).padStart(2, "0")}`;
}

/**
 * The pieces an account owes for a month, with a pillar and a suggested date
 * each. Pure: the same account, month and offset always give the same slots.
 * Pass each account a different `offset` (its position in the program) to
 * stagger the suggested dates. Slots are numbered the same whatever the
 * offset, which is what lets the database ignore slots that already exist.
 */
export function planSlots(quota: Quota, month: string, offset = 0): PlannedSlot[] {
  const slots: PlannedSlot[] = [];
  const add = (kind: Kind, count: number, shift: number, pillar: (i: number) => Pillar) => {
    for (let i = 0; i < count; i++)
      slots.push({ kind, slot: i + 1, pillar: pillar(i), scheduled_for: spread(month, count, i, offset + shift) });
  };
  add("post", quota.posts_per_month, 0, (i) => POST_ROTATION[i % POST_ROTATION.length]);
  // Reels and Google posts start a little later so they do not sit on a post's date.
  add("reel", quota.reels_per_month, 2, () => "video");
  add("google_post", quota.google_posts_per_month, 4, () => "google_update");
  return slots;
}

export const quotaTotal = (q: Quota) => q.posts_per_month + q.reels_per_month + q.google_posts_per_month;

// ---------------------------------------------------------------------------
// Media supply
// ---------------------------------------------------------------------------

/** Short clips needed to cut one reel. */
export const CLIPS_PER_REEL = 3;
/** Media older than this is treated as used up when judging supply. */
export const MEDIA_WINDOW_DAYS = 90;

export type MediaHealth = "good" | "low" | "out";
export const MEDIA_HEALTH_LABEL: Record<MediaHealth, string> = {
  good: "Media OK",
  low: "Media low",
  out: "Needs media",
};
export const MEDIA_HEALTH_PILL: Record<MediaHealth, string> = {
  good: "bg-emerald-100 text-emerald-700",
  low: "bg-amber-100 text-amber-800",
  out: "bg-rose-100 text-rose-700",
};

/**
 * How many months of content the recently received media covers: two or more
 * is good, one is low, less than one means we cannot produce next month.
 */
export function mediaHealth(quota: Quota, recent: { photos: number; videos: number }): MediaHealth {
  const cover: number[] = [];
  if (quota.posts_per_month > 0) cover.push(recent.photos / quota.posts_per_month);
  if (quota.reels_per_month > 0) cover.push(recent.videos / (quota.reels_per_month * CLIPS_PER_REEL));
  if (cover.length === 0) return "good";
  const months = Math.min(...cover);
  return months >= 2 ? "good" : months >= 1 ? "low" : "out";
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type StatusCounts = Record<Status, number>;
export function countByStatus(items: { status: Status }[]): StatusCounts {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as StatusCounts;
  for (const item of items) counts[item.status] += 1;
  return counts;
}
export const sumOf = (counts: StatusCounts, statuses: readonly Status[]) =>
  statuses.reduce((n, s) => n + counts[s], 0);
/** A piece is late when its date has passed and it is not scheduled or live. */
export function isLate(item: { status: Status; scheduled_for: string | null }, today: string): boolean {
  return !!item.scheduled_for && item.scheduled_for < today && !DONE.includes(item.status);
}

// ---------------------------------------------------------------------------
// Requests the office can make
// ---------------------------------------------------------------------------

const id = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
/** An https link, or blank. */
const link = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .max(500)
    .refine((v) => {
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    }, "Use a link that starts with https://"),
]);
const month = z.string().regex(MONTH_RE);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Not a real date");
const count = (max: number) => z.number().int().min(0).max(max);
const some = (v: Record<string, unknown>) => Object.keys(v).length > 0;

export const profileLinks = z.partialRecord(z.enum(PLATFORMS), link);
export type ProfileLinks = z.infer<typeof profileLinks>;

export const accountPatch = z
  .object({
    name: text(160).min(1),
    profile_links: profileLinks,
    tier: z.enum(TIERS),
    platforms: z.array(z.enum(PLATFORMS)).max(PLATFORMS.length),
    posts_per_month: count(60),
    reels_per_month: count(20),
    google_posts_per_month: count(20),
    brand_kit_url: link,
    media_folder_url: link,
    voice_notes: text(4000),
    access_status: z.enum(ACCESS_STATUSES),
    access_note: text(500),
    is_active: z.boolean(),
  })
  .partial()
  .refine(some, "Nothing to change");

export const itemPatch = z
  .object({
    title: text(200),
    caption: text(5000),
    pillar: z.enum(PILLARS),
    status: z.enum(STATUSES),
    scheduled_for: date.nullable(),
    assignee: id.nullable(),
    design_url: link,
    published_url: link,
    review_note: text(2000),
  })
  .partial()
  .refine(some, "Nothing to change");

export const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_program"),
    name: text(160).min(1),
    contact_name: text(160).default(""),
    contact_email: z.union([z.literal(""), z.string().trim().email().max(254)]).default(""),
    publishing_tool: text(80).default(""),
  }),
  z.object({
    action: z.literal("update_program"),
    id,
    patch: z
      .object({
        name: text(160).min(1),
        contact_name: text(160),
        contact_email: z.union([z.literal(""), z.string().trim().email().max(254)]),
        publishing_tool: text(80),
        status: z.enum(PROGRAM_STATUSES),
        notes: text(4000),
      })
      .partial()
      .refine(some, "Nothing to change"),
  }),
  z.object({
    action: z.literal("add_accounts"),
    program_id: id,
    tier: z.enum(TIERS),
    accounts: z
      .array(z.object({ name: text(160).min(1), profile_links: profileLinks.default({}) }))
      .min(1)
      .max(60),
  }),
  z.object({ action: z.literal("update_account"), id, patch: accountPatch }),
  z.object({ action: z.literal("plan_month"), program_id: id, month }),
  z.object({ action: z.literal("update_item"), id, patch: itemPatch }),
  z.object({
    action: z.literal("add_media"),
    account_id: id,
    received_on: date,
    source: z.enum(MEDIA_SOURCES),
    photos: count(2000),
    videos: count(500),
    link: link.default(""),
    note: text(500).default(""),
  }).refine((v) => v.photos + v.videos > 0, "Enter how many photos or videos arrived"),
  z.object({ action: z.literal("add_request"), account_id: id, ask: text(500).min(1), due_on: date.nullable().default(null) }),
  z.object({ action: z.literal("update_request"), id, status: z.enum(REQUEST_STATUSES) }),
]);
export type SocialAction = z.infer<typeof actionSchema>;

const HOSTS: [RegExp, Platform][] = [
  [/(^|\.)(facebook|fb)\.com$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)(x|twitter)\.com$/, "x"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(google\.com|g\.page|goo\.gl)$/, "google"],
];
/** Which platform a profile link belongs to, going by its address. */
export function platformOf(url: string): Platform | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return HOSTS.find(([re]) => re.test(u.hostname.toLowerCase()))?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Accounts pasted one per line. A line is the account name, optionally
 * followed by its profile links (separated by spaces, commas, tabs or "|"),
 * so a client's account list can be pasted straight from a spreadsheet.
 * Blank lines and repeated names are dropped.
 */
export function parseAccountLines(value: string): { name: string; profile_links: ProfileLinks }[] {
  const seen = new Set<string>();
  const accounts: { name: string; profile_links: ProfileLinks }[] = [];
  for (const line of value.split(/\r?\n/)) {
    const profile_links: ProfileLinks = {};
    const rest = line.replace(/https:\/\/[^\s,|]+/g, (url) => {
      const platform = platformOf(url);
      if (platform && !profile_links[platform]) profile_links[platform] = url.slice(0, 500);
      return " ";
    });
    const name = rest.replace(/[|,\t]+/g, " ").replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    accounts.push({ name: name.slice(0, 160), profile_links });
  }
  return accounts;
}
