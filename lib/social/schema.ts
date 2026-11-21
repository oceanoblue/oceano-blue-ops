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
export const APPROVAL_MODES = ["office", "individual", "batch"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
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

export const AGREEMENT_STATUSES = ["draft", "sent", "client_signed", "signed", "void"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];
export const AGREEMENT_LABEL: Record<AgreementStatus, string> = {
  draft: "Draft",
  sent: "Waiting for the client",
  client_signed: "Signed by the client, needs our signature",
  signed: "Signed by both",
  void: "Cancelled",
};
export const AGREEMENT_PILL: Record<AgreementStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-amber-100 text-amber-800",
  client_signed: "bg-sky-100 text-sky-800",
  signed: "bg-emerald-100 text-emerald-800",
  void: "bg-slate-100 text-slate-500 line-through",
};

/** What a client agrees to when they sign. Stored with the signature, word for word. */
export const CLIENT_SIGNING_CONSENT =
  "I have read this agreement in full. I am authorized to sign it for the client named in it, I consent to using electronic records and signatures, and I agree that typing my full name is my signature.";
/** What we agree to when we countersign. Stored with the signature, word for word. */
export const COUNTERSIGN_CONSENT =
  "I have reviewed the agreement the client signed. I am authorized to sign for Oceano Blue Media, I consent to using electronic records and signatures, and I agree that typing my full name is my signature.";

/** How far along a piece is, in words a client understands. */
export const CLIENT_STAGES = ["in_progress", "for_review", "approved", "scheduled", "live"] as const;
export type ClientStage = (typeof CLIENT_STAGES)[number];
export const CLIENT_STAGE_LABEL: Record<ClientStage, string> = {
  in_progress: "In progress",
  for_review: "Ready for your review",
  approved: "Approved",
  scheduled: "Scheduled",
  live: "Live",
};
export const CLIENT_STAGE_PILL: Record<ClientStage, string> = {
  in_progress: "bg-slate-100 text-slate-700",
  for_review: "bg-amber-100 text-amber-800",
  approved: "bg-sky-100 text-sky-800",
  scheduled: "bg-indigo-100 text-indigo-800",
  live: "bg-emerald-100 text-emerald-800",
};
export function clientStage(status: Status): ClientStage {
  if (status === "published") return "live";
  if (status === "scheduled") return "scheduled";
  if (status === "approved") return "approved";
  if (status === "client_review") return "for_review";
  return "in_progress";
}

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
// Program terms and onboarding
// ---------------------------------------------------------------------------

/** The steps every new program goes through, in order. */
export const ONBOARDING_STEPS = [
  "agreement_signed",
  "first_invoice",
  "accounts_loaded",
  "brand_kits",
  "publishing_tool",
  "account_access",
  "brand_rules",
  "media_received",
  "style_approved",
  "first_month_planned",
  "first_month_scheduled",
  "reporting_ready",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export const ONBOARDING_LABEL: Record<OnboardingStep, string> = {
  agreement_signed: "Agreement signed",
  first_invoice: "First invoice sent",
  accounts_loaded: "Accounts loaded with profile links",
  brand_kits: "Canva brand kits linked and opened",
  publishing_tool: "Publishing tool set up and profiles connected",
  account_access: "Access confirmed for every account",
  brand_rules: "Brand and music rules received",
  media_received: "Starting photos and video received",
  style_approved: "Style and templates approved by the client",
  first_month_planned: "First month planned",
  first_month_scheduled: "First month scheduled",
  reporting_ready: "Monthly report set up",
};
export type Onboarding = Partial<Record<OnboardingStep, string>>;

/** "$5,650" for 565000 cents; cents are dropped when zero. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
/** Dollars typed into a form, as cents. Blank or invalid is zero. */
export function dollarsToCents(value: string): number {
  const n = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.min(100000000, Math.round(n * 100)) : 0;
}
/** The last month of a term that starts on `start` and runs `months`, as "March 2028". */
export function termEndLabel(start: string | null, months: number): string {
  if (!start || months < 1) return "";
  return monthLabel(shiftMonth(start.slice(0, 7), months - 1));
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

/** Words or phrases captions must not use. */
const terms = z.array(text(60).min(1)).max(40);
const cents = z.number().int().min(0).max(100000000);

export const profileLinks = z.partialRecord(z.enum(PLATFORMS), link);
export type ProfileLinks = z.infer<typeof profileLinks>;

export const accountPatch = z
  .object({
    name: text(160).min(1),
    profile_links: profileLinks,
    publishing_timezone: text(100).refine((v) => { try { if (v) new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; } }, "Enter an IANA timezone, such as America/New_York."),
    provider_destinations: z.partialRecord(z.enum(PLATFORMS), text(200)),
    tier: z.enum(TIERS),
    platforms: z.array(z.enum(PLATFORMS)).max(PLATFORMS.length),
    posts_per_month: count(60),
    post_weekdays: z.array(z.number().int().min(0).max(6)).max(7)
      .refine(days => new Set(days).size === days.length, "Choose each weekday once"),
    reels_per_month: count(20),
    google_posts_per_month: count(20),
    brand_kit_url: link,
    media_folder_url: link,
    voice_notes: text(4000),
    access_status: z.enum(ACCESS_STATUSES),
    access_note: text(500),
    is_active: z.boolean(),
    avoid_terms: terms,
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
    publish_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    assignee: id.nullable(),
    design_url: link,
    published_url: link,
    review_note: text(2000),
  })
  .partial()
  .refine(some, "Nothing to change");

/** What a logo can belong to. */
export const LOGO_TARGETS = ["client", "account"] as const;
export type LogoTarget = (typeof LOGO_TARGETS)[number];

/** One or two letters to show where a logo has not been added: "NH" for Newport Hospitality Group. */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0];
  const second = words.find((w, i) => i > 0 && !["of", "the", "and", "by", "at", "inn", "suites"].includes(w.toLowerCase()));
  return ((first[0] ?? "") + (second?.[0] ?? first[1] ?? "")).toUpperCase();
}

/**
 * Other names that start with the same word, taken as the same brand
 * ("Courtyard Somerset" and "Courtyard West Orange"). Used to offer one
 * uploaded logo to the rest of a brand's sub-accounts.
 */
export function sameBrand<T extends { id: string; name: string }>(of: T, all: T[]): { brand: string; others: T[] } {
  const brand = of.name.trim().split(/\s+/)[0] ?? "";
  if (!brand) return { brand, others: [] };
  return { brand, others: all.filter((a) => a.id !== of.id && a.name.trim().split(/\s+/)[0]?.toLowerCase() === brand.toLowerCase()) };
}

/** Count the fill-in fields the agreement editor highlights before a draft is locked. */
export function agreementPlaceholderCount(title: string, body: string): number {
  return ((title + "\n" + body).match(/\[[^\]\n]{1,200}\]/g) ?? []).length;
}

/** Agreement text. Line breaks are kept; lines starting with "# " or "## " are headings. */
const agreementBody = z.string().max(120000).refine((v) => v.trim().length > 0, "Add the agreement text");

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
        approval_mode: z.enum(APPROVAL_MODES),
        publishing_enabled: z.boolean(),
        status: z.enum(PROGRAM_STATUSES),
        notes: text(4000),
        monthly_fee_cents: cents,
        account_rate_cents: cents,
        minimum_fee_cents: cents,
        term_start: date.nullable(),
        term_months: count(60),
        media_due_day: z.number().int().min(1).max(28).nullable(),
        agreement_url: link,
        media_upload_url: link,
        avoid_terms: terms,
      })
      .partial()
      .refine(some, "Nothing to change"),
  }),
  z.object({
    action: z.literal("add_accounts"),
    program_id: id,
    tier: z.enum(TIERS),
    accounts: z
      .array(z.object({ name: text(160).min(1), profile_links: profileLinks.default({}), brand_kit_url: link.default("") }))
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
  z.object({ action: z.literal("set_onboarding_step"), id, step: z.enum(ONBOARDING_STEPS), done: z.boolean() }),
  /** The office has dealt with a client's change request on a piece. */
  z.object({ action: z.literal("resolve_client_feedback"), id, revision: z.number().int().positive() }),
  z.object({ action: z.literal("authorize_piece"), id, revision: z.number().int().positive() }),
  /** The office has dealt with a note the client sent. */
  z.object({ action: z.literal("resolve_client_note"), id }),
  z.object({ action: z.literal("remove_logo"), target: z.enum(LOGO_TARGETS), id }),
  /** Give other sub-accounts of the same client this sub-account's logo. */
  z.object({ action: z.literal("share_logo"), account_id: id, to: z.array(id).min(1).max(60) }),
  z.object({ action: z.literal("set_report_link"), id, enabled: z.boolean() }),
  z.object({ action: z.literal("create_agreement"), program_id: id, title: text(200).min(1), body: agreementBody }),
  z.object({ action: z.literal("update_agreement"), id, title: text(200).min(1), body: agreementBody }),
  z.object({ action: z.literal("send_agreement"), id }),
  z.object({ action: z.literal("void_agreement"), id }),
  z.object({
    action: z.literal("countersign_agreement"),
    id,
    signer_name: text(120).min(2),
    signer_title: text(120).default(""),
    consent: z.literal(true),
  }),
  z.object({ action: z.literal("draft_caption"), id, context: z.object({title:text(200),pillar:z.enum(PILLARS),scheduled_for:date.nullable()}).optional() }),
]);
export type SocialAction = z.infer<typeof actionSchema>;

/** What a client sends from the signing page. */
export const signSchema = z.object({
  signer_name: text(120).min(2, "Type your full name"),
  signer_title: text(120).default(""),
  signer_email: z.string().trim().email("Enter a valid email address").max(254).transform((v) => v.toLowerCase()),
  consent: z.literal(true, "Tick the box to confirm"),
  /** The version of the text the signer was shown. */
  document_hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SignRequest = z.infer<typeof signSchema>;

/** When a signature was made, in the business time zone with the zone named: "November 23, 2026 at 2:10:00 PM EST". */
export function signatureTime(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleString("en-US", { dateStyle: "long", timeStyle: "long", timeZone: BUSINESS_TZ });
}

/** A person's name as they type it on a client page. There is no sign-in, so this is what they tell us. */
const personName = text(120).min(2, "Type your name");

/**
 * What a client can send from their private page: an answer on one piece, an
 * approval of everything waiting for one sub-account, or a note to the team.
 */
const revision = z.number().int().positive();
const displayedItems = z.array(z.object({ id, revision })).min(1).max(150)
  .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Each piece must appear once.");
export const clientActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), item_id: id, revision, name: personName }),
  z.object({ action: z.literal("request_changes"), item_id: id, revision, name: personName, note: text(2000).min(3, "Tell us what to change") }),
  /** Approve everything waiting for one sub-account in the month the client is looking at. */
  z.object({ action: z.literal("approve_all"), account_id: id, month, items: displayedItems, name: personName }),
  z.object({ action: z.literal("note"), account_id: id.nullable().default(null), name: personName, message: text(2000).min(3, "Write your note") }),
]);
export type ClientAction = z.infer<typeof clientActionSchema>;

/** One line or block of agreement text, ready to display. */
export type AgreementBlock = { type: "h1" | "h2" | "p"; text: string };
/** Split agreement text into headings and paragraphs. Blank lines separate paragraphs. */
export function agreementBlocks(body: string): AgreementBlock[] {
  const blocks: AgreementBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,2})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: heading[1].length === 1 ? "h1" : "h2", text: heading[2].trim() });
    } else if (line.trim() === "") flush();
    else paragraph.push(line);
  }
  flush();
  return blocks;
}

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

/** A link into Canva (a brand kit, folder or design). */
export function isCanvaLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)canva\.com$/.test(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Terms typed as a comma or line separated list: trimmed, de-duplicated, at most 40. */
export function parseTerms(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/[,\n]/)) {
    const term = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!term || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    out.push(term);
  }
  return out.slice(0, 40);
}

/**
 * Accounts pasted one per line. A line is the account name, optionally
 * followed by its profile links and Canva brand kit link (separated by
 * spaces, commas, tabs or "|"),
 * so a client's account list can be pasted straight from a spreadsheet.
 * Blank lines and repeated names are dropped.
 */
export function parseAccountLines(value: string): { name: string; profile_links: ProfileLinks; brand_kit_url: string }[] {
  const seen = new Set<string>();
  const accounts: { name: string; profile_links: ProfileLinks; brand_kit_url: string }[] = [];
  for (const line of value.split(/\r?\n/)) {
    const profile_links: ProfileLinks = {};
    let brand_kit_url = "";
    const rest = line.replace(/https:\/\/[^\s,|]+/g, (url) => {
      if (isCanvaLink(url)) {
        brand_kit_url ||= url.slice(0, 500);
        return " ";
      }
      const platform = platformOf(url);
      if (platform && !profile_links[platform]) profile_links[platform] = url.slice(0, 500);
      return " ";
    });
    const name = rest.replace(/[|,\t]+/g, " ").replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    accounts.push({ name: name.slice(0, 160), profile_links, brand_kit_url });
  }
  return accounts;
}
