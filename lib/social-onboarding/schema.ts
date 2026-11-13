import { z } from "zod";

/**
 * Social media client onboarding: the questions, upload rules and request
 * shapes shared by the public page (/social/start), its API and the office
 * view. No server imports here, so the browser can use it too.
 */

/** The address clients invite to their accounts. Shown on the public page. */
export const ACCESS_EMAIL = "info@oceanoblue.net";
export const OFFICE_PHONE = "843-505-8586";

export const SOCIAL_BUCKET = "social-onboarding";
export const MAX_FILES = 40;
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB, matches the bucket limit
export const MAX_SUBMISSION_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB declared per client
export const UPLOAD_WINDOW_HOURS = 24;
/** Files above this size upload in resumable 6 MB chunks. */
export const RESUMABLE_BYTES = 6 * 1024 * 1024;

export type FileKind = "image" | "video" | "document" | "design";
const KINDS: Record<FileKind, string[]> = {
  image: ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "tif", "tiff"],
  video: ["mp4", "mov", "m4v", "webm"],
  document: ["pdf", "doc", "docx", "ppt", "pptx", "txt", "csv", "xlsx"],
  design: ["ai", "eps", "svg", "psd", "indd", "otf", "ttf", "woff", "woff2", "zip"],
};
export const ALLOWED_EXTENSIONS = Object.values(KINDS).flat();
export const FILE_KIND_LABEL: Record<FileKind, string> = {
  image: "Photos and images",
  video: "Videos",
  document: "Documents",
  design: "Logos, fonts and design files",
};

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}
export function fileKind(name: string): FileKind | null {
  const ext = fileExtension(name);
  return (
    (Object.keys(KINDS) as FileKind[]).find((k) => KINDS[k].includes(ext)) ??
    null
  );
}
/** Why a file can't be accepted, or null when it can. */
export function fileProblem(name: string, size: number): string | null {
  if (!fileKind(name)) return "This file type isn't supported.";
  if (size <= 0) return "This file is empty.";
  if (size > MAX_FILE_BYTES) return "This file is larger than 2 GB.";
  return null;
}
/** Storage-safe file name: keeps the extension, drops anything path-like. */
export function safeFileName(name: string): string {
  const ext = fileExtension(name);
  const stem = (ext ? name.slice(0, -(ext.length + 1)) : name)
    .normalize("NFKD")
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `${stem || "file"}.${ext}`;
}
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export const PACKAGES = [
  "Social Media Management",
  "Monthly Content Shoot",
  "Full Package",
  "Not sure yet",
] as const;

export const ACCESS_STATES = [
  "I added Oceano Blue Media",
  "I need help with this",
  "I don't have this account",
] as const;

export const PLATFORMS = [
  { key: "facebook", label: "Facebook Page", placeholder: "facebook.com/yourpage" },
  { key: "instagram", label: "Instagram", placeholder: "@yourhandle" },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/@yourchannel" },
] as const;
export type PlatformKey = (typeof PLATFORMS)[number]["key"];

export type Question = {
  key: string;
  label: string;
  hint?: string;
  type: "text" | "textarea" | "select" | "email" | "tel" | "url";
  options?: readonly string[];
  required?: boolean;
  placeholder?: string;
  wide?: boolean;
};

export const ABOUT_QUESTIONS: Question[] = [
  { key: "business_name", label: "Business name", type: "text", required: true },
  { key: "contact_name", label: "Your name", type: "text", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "website", label: "Website", type: "text", placeholder: "yourbusiness.com" },
  { key: "package", label: "Which package are you starting with?", type: "select", options: PACKAGES, required: true },
];

export const BRAND_QUESTIONS: Question[] = [
  {
    key: "brand_guide",
    label: "Do you have a brand guide?",
    type: "select",
    options: [
      "Yes, I'm uploading it below",
      "I have a logo and some colors",
      "No, please create a look for us",
    ],
    required: true,
  },
  {
    key: "tone",
    label: "How should your posts sound?",
    type: "select",
    options: [
      "Professional and polished",
      "Friendly and neighborly",
      "Luxury and refined",
      "Bold and energetic",
      "Not sure, recommend one",
    ],
  },
  { key: "brand_colors", label: "Brand colors", type: "text", placeholder: "Navy and gold, or hex codes if you have them" },
  { key: "brand_fonts", label: "Fonts you use", type: "text", placeholder: "Leave blank if you're not sure" },
  { key: "tagline", label: "Tagline or slogan", type: "text", wide: true },
  {
    key: "inspiration",
    label: "Accounts you like",
    hint: "Two or three accounts whose look or content you'd like to be close to.",
    type: "textarea",
    wide: true,
  },
];

export const CONTENT_QUESTIONS: Question[] = [
  {
    key: "goal",
    label: "What do you want social media to do for the business?",
    hint: "More listing inquiries, local name recognition, recruiting, anything specific.",
    type: "textarea",
    required: true,
    wide: true,
  },
  {
    key: "audience",
    label: "Who are your ideal clients?",
    type: "textarea",
    wide: true,
  },
  {
    key: "target_areas",
    label: "Areas you want to reach",
    hint: "Local communities, plus any places people are moving from that you'd like to show up in.",
    type: "textarea",
    placeholder: "Bluffton, Hilton Head, Palmetto Bluff, and buyers relocating from Ohio",
    wide: true,
  },
  {
    key: "topics",
    label: "Topics to cover",
    hint: "Listings, market updates, neighborhood guides, why people move here, behind the scenes.",
    type: "textarea",
    wide: true,
  },
  { key: "avoid", label: "Anything we should stay away from?", type: "textarea", wide: true },
  {
    key: "on_camera",
    label: "Are you comfortable on camera?",
    type: "select",
    options: ["Yes", "Sometimes", "I'd rather use voiceover only"],
  },
  {
    key: "approval",
    label: "How do you want to approve posts?",
    type: "select",
    options: [
      "Send me the month's calendar to approve",
      "Send me each post to approve",
      "I trust you, post without approval",
    ],
    required: true,
  },
  { key: "approver", label: "Who approves posts?", type: "text", placeholder: "Name and email, if it isn't you" },
  {
    key: "ads",
    label: "Interested in paid promotion?",
    hint: "Boosting a post to a specific area, like a listing shown to buyers in another state.",
    type: "select",
    options: ["Yes", "Maybe later", "No"],
  },
  {
    key: "library_link",
    label: "Link to your photo and video library",
    hint: "A Dropbox or Google Drive folder works well for large libraries. Set sharing to anyone with the link.",
    type: "url",
    placeholder: "https://",
    wide: true,
  },
  { key: "notes", label: "Anything else we should know?", type: "textarea", wide: true },
];

export const ALL_QUESTIONS = [...ABOUT_QUESTIONS, ...BRAND_QUESTIONS, ...CONTENT_QUESTIONS];

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

const line = (max: number) =>
  z.string().trim().max(max).regex(/^[^\r\n]*$/, "Use a single line.");
const block = (max: number) => z.string().trim().max(max);
const pick = <T extends readonly [string, ...string[]]>(options: T) =>
  z.enum(options).or(z.literal(""));
const options = (key: string) =>
  ALL_QUESTIONS.find((q) => q.key === key)!.options as unknown as [string, ...string[]];
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), "Paste a full link starting with https://");

const platformSchema = z.object({
  handle: line(300).default(""),
  access: pick(ACCESS_STATES).default(""),
});

export const answersSchema = z.object({
  business_name: line(180).min(1, "Add your business name."),
  contact_name: line(180).min(1, "Add your name."),
  email: z.string().trim().max(254).email("Check the email address."),
  phone: line(40).default(""),
  website: line(300).default(""),
  package: z.enum(PACKAGES, "Choose a package."),
  platforms: z
    .object({
      facebook: platformSchema.prefault({}),
      instagram: platformSchema.prefault({}),
      youtube: platformSchema.prefault({}),
    })
    .prefault({}),
  other_accounts: block(1000).default(""),
  brand_guide: z.enum(options("brand_guide"), "Tell us whether you have a brand guide."),
  tone: pick(options("tone")).default(""),
  brand_colors: line(300).default(""),
  brand_fonts: line(300).default(""),
  tagline: line(300).default(""),
  inspiration: block(2000).default(""),
  goal: block(4000).min(1, "Tell us what you want social media to do for you."),
  audience: block(4000).default(""),
  target_areas: block(2000).default(""),
  topics: block(4000).default(""),
  avoid: block(2000).default(""),
  on_camera: pick(options("on_camera")).default(""),
  approval: z.enum(options("approval"), "Choose how you want to approve posts."),
  approver: line(300).default(""),
  ads: pick(options("ads")).default(""),
  library_link: httpUrl.default(""),
  notes: block(4000).default(""),
});
export type SocialAnswers = z.infer<typeof answersSchema>;

const uploadToken = z.string().regex(/^[A-Za-z0-9_-]{43,86}$/);

export const submitSchema = z.object({
  submission_id: z.string().uuid(),
  upload_token: uploadToken,
  /** Honeypot. Real people never fill it in. */
  company_site: z.string().max(500).default(""),
  expected_files: z.number().int().min(0).max(MAX_FILES).default(0),
  answers: answersSchema,
});

export const fileRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sign"),
    submission_id: z.string().uuid(),
    upload_token: uploadToken,
    file_id: z.string().uuid(),
    name: z.string().trim().min(1).max(255),
    size: z.number().int().positive().max(MAX_FILE_BYTES),
    content_type: z.string().trim().max(150).default(""),
  }),
  z.object({
    action: z.literal("done"),
    submission_id: z.string().uuid(),
    upload_token: uploadToken,
    file_id: z.string().uuid(),
  }),
]);

/** First validation message, phrased for the person filling in the form. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message || "Check the form and try again.";
}

/** Label/value pairs for the office view and the office email. */
export function answerRows(a: SocialAnswers): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string) => {
    if (value) rows.push({ label, value });
  };
  for (const q of ABOUT_QUESTIONS) add(q.label, String(a[q.key as keyof SocialAnswers] ?? ""));
  for (const p of PLATFORMS) {
    const v = a.platforms[p.key];
    add(p.label, [v.handle, v.access].filter(Boolean).join(" — "));
  }
  add("Other accounts", a.other_accounts);
  for (const q of [...BRAND_QUESTIONS, ...CONTENT_QUESTIONS])
    add(q.label, String(a[q.key as keyof SocialAnswers] ?? ""));
  return rows;
}
