import { z } from "zod";
import { fieldSchema } from "./types";
const text = (max: number) => z.string().trim().max(max);
const uuid = z.string().uuid();
export const variables = [
  "first_name",
  "client_name",
  "project_name",
  "project_type",
] as const;
export const messageTemplateSchema = z.object({
  name: text(120).min(1),
  subject: text(200)
    .min(1)
    .refine((v) => !/[\r\n]/.test(v), "Use a single-line subject."),
  body: text(10000).min(1),
  ready: z.boolean().default(false),
});
const safeLink = z
  .string()
  .url()
  .max(2000)
  .refine((v) => {
    const url = new URL(v);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Use a secure HTTPS link.");
export const fileBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    id: uuid,
    kind: z.literal("text"),
    title: text(180),
    body: text(10000),
  }),
  z.object({
    id: uuid,
    kind: z.literal("link"),
    title: text(180).min(1),
    url: safeLink,
    body: text(1000).default(""),
  }),
  z.object({
    id: uuid,
    kind: z.literal("question"),
    field: fieldSchema.refine(
      (f) => f.type !== "select" || !!f.options?.length,
      "Add select options.",
    ),
  }),
]);
export const fileTemplateSchema = z
  .object({
    name: text(120).min(1),
    title: text(180).min(1),
    description: text(2000).default(""),
    ready: z.boolean().default(false),
    blocks: z.array(fileBlockSchema).min(1).max(40),
  })
  .superRefine((v, ctx) => {
    const keys = v.blocks
      .filter((b) => b.kind === "question")
      .map((b) => b.field.key);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: "custom",
        message: "Question keys must be unique.",
      });
    if (new Set(v.blocks.map((b) => b.id)).size !== v.blocks.length)
      ctx.addIssue({ code: "custom", message: "Block IDs must be unique." });
  });
export const sequenceStepSchema = z
  .object({
    id: uuid,
    kind: z.enum(["email", "task"]),
    delay: z.number().int().min(0).max(365),
    unit: z.enum(["hours", "business_days"]),
    message_template_id: uuid.nullable().default(null),
    file_template_id: uuid.nullable().default(null),
    task_title: text(180).default(""),
    requires_approval: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "email" && !v.message_template_id)
      ctx.addIssue({ code: "custom", message: "Choose an email template." });
    if (v.kind === "task" && !v.task_title)
      ctx.addIssue({ code: "custom", message: "Enter a task title." });
  });
export const sequenceSchema = z
  .object({
    name: text(120).min(1),
    form_id: uuid,
    enabled: z.boolean().default(false),
    timezone: text(80)
      .min(1)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid timezone."),
    steps: z.array(sequenceStepSchema).min(1).max(12),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.steps.map((s) => s.id)).size !== v.steps.length)
      ctx.addIssue({ code: "custom", message: "Step IDs must be unique." });
  });
const base = { id: uuid, version: z.number().int().min(0) };
export const acquisitionActionSchema = z.discriminatedUnion("action", [
  z.object({
    ...base,
    action: z.literal("message_template_save"),
    data: messageTemplateSchema,
  }),
  z.object({
    ...base,
    action: z.literal("file_template_save"),
    data: fileTemplateSchema,
  }),
  z.object({
    ...base,
    action: z.literal("sequence_save"),
    data: sequenceSchema,
  }),
  z.object({
    id: uuid,
    action: z.literal("issue_file"),
    data: z.object({
      project_id: uuid,
      message_template_id: uuid,
      file_template_id: uuid,
    }),
  }),
  z.object({ id: uuid, action: z.literal("job_approve"), data: z.object({}) }),
  z.object({ id: uuid, action: z.literal("job_cancel"), data: z.object({}) }),
  z.object({ id: uuid, action: z.literal("job_retry"), data: z.object({}) }),
  z.object({
    id: uuid,
    action: z.literal("project_pause"),
    data: z.object({ reason: text(500).min(1) }),
  }),
  z.object({ id: uuid, action: z.literal("file_revoke"), data: z.object({}) }),
]);
export type MessageTemplate = z.infer<typeof messageTemplateSchema> & {
  id: string;
  version: number;
};
export type FileTemplate = z.infer<typeof fileTemplateSchema> & {
  id: string;
  version: number;
};
export type FileDocument = z.infer<typeof fileTemplateSchema>;
export type Sequence = z.infer<typeof sequenceSchema> & {
  id: string;
  version: number;
};
export type FileContext = {
  first_name: string;
  client_name: string;
  project_name: string;
  project_type: string;
};
export type IssuedFile = {
  id: string;
  project_id: string;
  client_id: string;
  title: string;
  created_at: string;
  expires_at: string;
  viewed_at: string | null;
  responded_at: string | null;
  revoked_at: string | null;
};
export type MailJob = {
  id: string;
  project_id: string;
  client_id: string;
  sequence_id: string | null;
  status: string;
  due_at: string;
  subject: string;
  body: string;
  context: FileContext;
  recipient: string;
  file_id: string | null;
  attempts: number;
  provider_id: string | null;
  last_error: string | null;
  first_attempt_at: string | null;
  created_at: string;
  accepted_at: string | null;
};
export type AcquisitionData = {
  messages: MessageTemplate[];
  files: FileTemplate[];
  sequences: Sequence[];
  forms: { id: string; name: string; published: boolean }[];
  jobs: MailJob[];
  issued: IssuedFile[];
  projects: {
    id: string;
    title: string;
    project_type: string;
    clients: { full_name: string; email: string } | null;
    crm_stages: { outcome: string } | null;
  }[];
  email: {
    configured: boolean;
    sendingEnabled: boolean;
    from: string;
    replyTo: string;
  };
};
export function mergeText(value: string, context: FileContext): string {
  return value.replace(
    /\{\{\s*(first_name|client_name|project_name|project_type)\s*\}\}/g,
    (_, key: keyof FileContext) => context[key] ?? "",
  );
}
export function validateFileAnswers(
  doc: FileDocument,
  input: unknown,
): Record<string, string> {
  const values = z.record(z.string().max(10000)).parse(input),
    result: Record<string, string> = {};
  for (const b of doc.blocks) {
    if (b.kind !== "question") continue;
    const f = b.field,
      v = (values[f.key] ?? "").trim();
    if (f.required && !v) throw new Error(`${f.label} is required.`);
    if (v.length > (f.type === "textarea" ? 10000 : 500))
      throw new Error(`${f.label} is too long.`);
    if (v && f.type === "select" && !f.options?.includes(v))
      throw new Error(`Choose an option for ${f.label}.`);
    if (v && f.type === "email" && !z.string().email().safeParse(v).success)
      throw new Error("Enter a valid email address.");
    if (v && f.type === "date" && !z.string().date().safeParse(v).success)
      throw new Error(`Check ${f.label}.`);
    if (
      v &&
      f.type === "number" &&
      (!Number.isFinite(Number(v)) || Number(v) < 0)
    )
      throw new Error(`Check ${f.label}.`);
    result[f.key] = v;
  }
  return result;
}
