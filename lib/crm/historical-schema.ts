import { z } from "zod";
export const historicalProjectSchema = z.object({
  source_id: z.string().trim().min(1).max(150),
  title: z.string().trim().min(1).max(180),
  client_name: z.string().trim().min(1).max(180),
  client_email: z.string().trim().toLowerCase().email().max(254),
  original_stage: z.string().trim().max(100).default(""),
  project_type: z.string().trim().max(100).default(""),
  lead_source: z.string().trim().max(150).default(""),
  project_date: z.string().date().nullable().default(null),
  value_cents: z.number().int().min(0).max(2000000000).default(0),
  description: z.string().trim().max(10000).default(""),
});
