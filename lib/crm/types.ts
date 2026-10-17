import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
export const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
  label: text(150).min(1),
  type: z.enum([
    "text",
    "textarea",
    "email",
    "tel",
    "date",
    "number",
    "select",
  ]),
  required: z.boolean().default(false),
  options: z.array(text(120).min(1)).max(60).optional(),
});
export type InquiryField = z.infer<typeof fieldSchema>;
export const defaultFields: InquiryField[] = [
  { key: "full_name", label: "Full name", type: "text", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "phone", label: "Phone number", type: "tel", required: false },
  { key: "project_date", label: "Project date", type: "date", required: false },
  { key: "address", label: "Address", type: "text", required: false },
  {
    key: "project_type",
    label: "What type of project are you looking for?",
    type: "text",
    required: false,
  },
  {
    key: "guest_count",
    label: "Estimated guest count",
    type: "number",
    required: false,
  },
  { key: "duration", label: "Estimated time", type: "text", required: false },
  { key: "budget", label: "Budget", type: "text", required: false },
  {
    key: "lead_source",
    label: "How did you hear about us?",
    type: "text",
    required: false,
  },
  {
    key: "message",
    label: "Tell me more about this project",
    type: "textarea",
    required: false,
  },
];
export const contactSchema = z.object({
  full_name: text(180).min(1),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: text(80).default(""),
  billing_address: text(2000).default(""),
  company: text(180).default(""),
  notes: text(10000).default(""),
  tags: z.array(text(60).min(1)).max(30).default([]),
  status: z.enum(["lead", "client", "archived"]).default("lead"),
});
const uuid = z.string().uuid();
export const dealSchema = z.object({
  client_id: uuid,
  title: text(180).min(1),
  stage_id: uuid,
  project_type: text(100).default(""),
  lead_source: text(150).default(""),
  value_cents: z.number().int().min(0).max(2000000000).default(0),
  project_date: z.string().date().nullable().default(null),
  next_follow_up: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .default(null),
  owner_id: uuid.nullable().default(null),
  description: text(10000).default(""),
  lost_reason: text(1000).default(""),
});
export const formSchema = z
  .object({
    name: text(150).min(1),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    title: text(180).min(1),
    description: text(1000).default(""),
    success_message: text(1000).min(1),
    published: z.boolean().default(false),
    fields: z.array(fieldSchema).min(2).max(40),
    default_project_type: text(100).default(""),
    owner_id: uuid.nullable().default(null),
  })
  .superRefine((f, ctx) => {
    const keys = f.fields.map((x) => x.key);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: "custom", message: "Field keys must be unique." });
    for (const key of ["full_name", "email"])
      if (
        !f.fields.some(
          (x) =>
            x.key === key &&
            x.required &&
            x.type === (key === "email" ? "email" : "text"),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: `A required ${key} field is needed.`,
        });
    if (f.fields.some((x) => x.key === "project_date" && x.type !== "date"))
      ctx.addIssue({
        code: "custom",
        message: "Project date must use the date answer type.",
      });
    if (f.fields.some((x) => x.type === "select" && !x.options?.length))
      ctx.addIssue({ code: "custom", message: "Select fields need options." });
  });
export const actions = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("contact_create"),
    id: uuid,
    data: contactSchema,
  }),
  z.object({
    action: z.literal("contact_update"),
    id: uuid,
    version: z.number().int().positive(),
    data: contactSchema,
  }),
  z.object({ action: z.literal("deal_create"), id: uuid, data: dealSchema }),
  z.object({
    action: z.literal("deal_update"),
    id: uuid,
    version: z.number().int().positive(),
    data: dealSchema,
  }),
  z.object({
    action: z.literal("note"),
    id: uuid,
    data: z.object({
      body: text(10000).min(1),
      project_id: uuid.nullable(),
      client_id: uuid,
    }),
  }),
  z.object({
    action: z.literal("task_create"),
    id: uuid,
    data: z.object({
      title: text(180).min(1),
      client_id: uuid.nullable(),
      project_id: uuid.nullable(),
      due_at: z.string().datetime({ offset: true }).nullable(),
      owner_id: uuid.nullable(),
    }),
  }),
  z.object({
    action: z.literal("task_update"),
    id: uuid,
    version: z.number().int().positive(),
    data: z.object({ completed: z.boolean() }),
  }),
  z.object({
    action: z.literal("form_save"),
    id: uuid,
    version: z.number().int().min(0),
    data: formSchema,
  }),
  z.object({
    action: z.literal("stage_save"),
    id: uuid,
    data: z.object({
      name: text(80).min(1),
      position: z.number().int().min(0).max(1000),
      outcome: z.enum(["open", "won", "lost", "archived"]),
    }),
  }),
  z.object({
    action: z.literal("automation_save"),
    id: uuid,
    data: z.object({
      name: text(120).min(1),
      enabled: z.boolean(),
      trigger: z.enum(["inquiry_received", "stage_changed"]),
      stage_id: uuid.nullable(),
      task_title: text(180).min(1),
      delay_hours: z.number().int().min(0).max(8760),
    }),
  }),
  z.object({
    action: z.literal("import"),
    id: uuid,
    data: z.object({ contacts: z.array(contactSchema).min(1).max(500) }),
  }),
]);
export function validateAnswers(
  fields: InquiryField[],
  input: unknown,
): Record<string, string> {
  const record = z.record(z.string().max(10000)).parse(input),
    answers: Record<string, string> = {};
  for (const field of fields) {
    const value = (record[field.key] ?? "").trim();
    if (field.required && !value)
      throw new Error(`${field.label} is required.`);
    if (
      value &&
      field.type === "email" &&
      !z.string().email().max(254).safeParse(value).success
    )
      throw new Error("Enter a valid email address.");
    if (
      value &&
      field.type === "date" &&
      !z.string().date().safeParse(value).success
    )
      throw new Error(`Check ${field.label}.`);
    if (
      value &&
      field.type === "number" &&
      (!Number.isFinite(Number(value)) || Number(value) < 0)
    )
      throw new Error(`Check ${field.label}.`);
    if (value && field.type === "select" && !field.options?.includes(value))
      throw new Error(`Choose an option for ${field.label}.`);
    if (value.length > (field.type === "textarea" ? 10000 : 500))
      throw new Error(`${field.label} is too long.`);
    answers[field.key] = value;
  }
  answers.email = answers.email.toLowerCase();
  return answers;
}
export type CrmContact = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  billing_address: string | null;
  brokerage: string | null;
  notes: string | null;
  crm_contact_profiles?: {
    company: string;
    tags: string[];
    status: string;
    version: number;
  } | null;
};
export type Stage = {
  id: string;
  name: string;
  position: number;
  outcome: "open" | "won" | "lost" | "archived";
};
export type Deal = z.infer<typeof dealSchema> & {
  id: string;
  project_id: string;
  version: number;
  created_at: string;
  clients?: { full_name: string; email: string };
};
export type CrmForm = z.infer<typeof formSchema> & {
  id: string;
  version: number;
};
export type Task = {
  id: string;
  title: string;
  client_id: string | null;
  project_id: string | null;
  due_at: string | null;
  owner_id: string | null;
  completed_at: string | null;
  version: number;
};
export type CrmEvent = {
  id: string;
  kind: string;
  body: string;
  client_id: string | null;
  project_id: string | null;
  created_at: string;
};
export type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: string;
  stage_id: string | null;
  task_title: string;
  delay_hours: number;
};
export type CrmData = {
  tags: string[];
  contacts: CrmContact[];
  deals: Deal[];
  stages: Stage[];
  tasks: Task[];
  forms: CrmForm[];
  events: CrmEvent[];
  automations: Automation[];
  team: { id: string; full_name: string }[];
  page: number;
  hasMore: boolean;
};
