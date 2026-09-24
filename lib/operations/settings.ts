import { z } from "zod";
import { isValidTimezone } from "./time";
import { DEFAULT_SETTINGS, type AgentSettings } from "./types";
const choice = z
  .object({
    provider: z.enum(["rules", "openai", "anthropic"]),
    model: z
      .string()
      .max(150)
      .regex(/^[a-zA-Z0-9_.:\/-]*$/),
  })
  .refine(
    (v) => v.provider === "rules" || v.model.length > 0,
    "Choose a model.",
  );
export const settingsSchema = z.object({
  enabled: z.boolean(),
  timezone: z
    .string()
    .max(100)
    .refine(isValidTimezone, "Choose a valid timezone."),
  brief_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  agents: z.object({ planner: choice, handoff: choice, delivery: choice }),
});
export function parseSettings(row: unknown): AgentSettings {
  const result = settingsSchema.safeParse(row);
  return result.success ? result.data : structuredClone(DEFAULT_SETTINGS);
}
