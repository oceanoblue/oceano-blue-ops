import type { AiJobType } from '@/lib/supabase/database.types';

/**
 * Prompts tuned for real estate interior/exterior photography.
 * Keep them precise and conservative — real estate photos must not invent
 * features that aren't there. Editors review every output.
 */
export const PROMPTS: Record<AiJobType, string> = {
  hdr_merge: `
Merge these bracketed exposures of the SAME interior real estate scene into a
single natural-looking HDR photo. Preserve true colors and architectural lines.
Pull window detail without blowing highlights. Lift shadows in dark corners
without crushing blacks. Keep ceiling and wall colors accurate (do not warm
shift). Output a single 16:9 image suitable for MLS upload. Do not invent
furniture, decor, or views through windows.
  `.trim(),

  enhance_single: `
This is a single-exposure real estate photo. Apply professional retouching:
straighten verticals, correct white balance toward neutral, lift shadows,
recover blown highlights through windows, gently boost vibrance, and remove
mild noise. Preserve every real-world detail. Do not add, remove, or change
furniture, fixtures, or any architectural feature.
  `.trim(),

  sky_replace: `
Replace the sky in this real estate exterior with a clean, lightly clouded
blue sky appropriate for daytime listing photography. Relight the scene to
match the new sky color temperature. Preserve the building, landscaping, and
all foreground elements exactly. Avoid dramatic or stylized skies — keep it
believable.
  `.trim(),

  window_pull: `
Pull the exterior view back into the windows of this real estate interior.
Reveal what is actually visible outside (do not invent landscapes). Maintain
realistic interior light balance. Preserve all reflections and frame details.
  `.trim(),

  lawn_enhance: `
Make the lawn and visible landscaping in this real estate exterior look
healthy: even green, no patchy brown areas. Do not change the layout of beds,
trees, or hardscape. Keep it believable, not cartoonish.
  `.trim(),

  declutter: `
Light declutter pass on this real estate interior. Remove visible personal
items (mail, magazines, charging cables, soap bottles, single small items on
counters). Do NOT remove furniture, art, plants, or anything attached to the
walls or floor. Preserve the room's overall character.
  `.trim(),

  twilight_convert: `
Convert this daytime real estate exterior into a twilight shot. Sky should
fade from deep blue at top to warm orange near horizon. Add believable warm
interior lighting through windows. Keep the architecture and landscaping
identical. No artificial moonlight or stars.
  `.trim(),

  virtual_stage: `
Virtually stage this empty room as a {room_type}. Use modern, mid-priced
furniture appropriate for a real estate listing. Match the room's lighting
direction and color temperature. Do not change the architecture, flooring,
walls, windows, or fixtures.
  `.trim(),
};

export function buildPrompt(jobType: AiJobType, extra?: string): string {
  const base = PROMPTS[jobType];
  return extra ? `${base}\n\nAdditional direction: ${extra}` : base;
}
