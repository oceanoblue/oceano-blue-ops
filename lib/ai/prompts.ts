import type { AiJobType } from '@/lib/supabase/database.types';

/**
 * Prompts tuned for real estate interior/exterior photography.
 * Keep them precise and conservative — real estate photos must not invent
 * features that aren't there. Editors review every output.
 *
 * The master prompt (LUXURY_REAL_ESTATE_BASE) is the same one we send to
 * every generation pass. It enforces realism, neutrality, and material
 * accuracy. Per-job instructions are prepended on top of it.
 */

const LUXURY_REAL_ESTATE_BASE = `
Your task is to recreate and professionally finish the image as if it were
edited by a top-tier architectural photography studio for luxury real estate
marketing.

Editing style must be: clean, neutral, ultra-natural, bright, realistic,
true-to-life, magazine-quality.

The image must NEVER feel: overly warm, overly cool, orange, blue, fake HDR,
overly contrasted, overly saturated, artificially sharpened, stylized, or
cinematic.

CRITICAL COLOR & WHITE BALANCE RULES
- Whites must look truly white.
- Use naturally neutral white balance.
- Avoid yellow, orange, cyan, green, or magenta contamination.
- Use ceilings, trim, cabinetry, and neutral surfaces as white references.
- Preserve realistic material colors.
- Maintain accurate skin tones if people are present.
- Keep the image balanced with ultra-clean whites while preserving detail.
- Do not crush highlights to achieve white.
- Preserve texture and detail in white walls, ceilings, fabrics, and cabinetry.
- Respect the natural lighting environment of the property.

TRUE-TO-LIFE EDITING PRIORITY
The final image should feel as if the room was photographed perfectly in
camera, natural daylight is illuminating the space, and the viewer is
physically standing inside the room. The result should resemble premium
architectural photography, luxury interior design magazines, high-end resort
marketing, and luxury MLS listings.

LIGHTING & EXPOSURE
Intelligently analyze and correct uneven HDR blending, muddy shadows, blown
highlights, poor tonal transitions, flat lighting, and unrealistic HDR glow.
Balance interior and exterior exposure naturally while preserving outdoor
visibility, maintaining realistic window brightness, avoiding fake dark
window pulls, avoiding halos around windows and furniture, and preserving
natural light falloff.

WINDOW PULLS
When windows are blown out: create realistic exterior visibility, maintain
natural brightness balance, preserve realistic transition between indoors
and outdoors, avoid artificial dark glass appearance, blend edges naturally
around frames, curtains, and reflections.

ARCHITECTURAL CORRECTIONS
Straighten verticals, correct perspective distortion, fix lens distortion,
maintain proper geometry, preserve realistic room proportions.

DETAIL PRESERVATION (CRITICAL)
Do NOT redesign, replace, remove, or invent elements that are intentionally
part of the scene. Respect: furniture placement, decor, artwork, lighting
fixtures, shadows, reflections, architectural details, exterior views,
textures, and styling choices.

Only remove: camera reflections, tripod reflections, photographer
reflections, sensor dust, temporary distractions, HDR artifacts, noise or
technical imperfections.

Never: replace furniture, alter decor styling, change wall colors, modify
architecture, add fake lighting, replace intentional design elements, or
overstage the space.

TEXTURE & MATERIAL HANDLING
Enhance materials naturally while preserving realism: wood grain, stone,
marble, fabrics, metals, tile, countertops, flooring. Avoid crunchy textures,
fake sharpness, plastic appearance, excessive clarity, overprocessed HDR
texture.

SKY & EXTERIOR HANDLING
Only replace skies if the original sky is completely blown out or weather
conditions damage the image quality. If replacing: keep skies realistic,
match lighting direction, match time of day, avoid dramatic sunset effects
unless naturally present.

FINAL OUTPUT TARGET
Luxurious, clean, spacious, balanced, naturally bright, professionally
photographed, color accurate, true to life. Ready for Zillow, MLS, luxury
brochures, architectural portfolios, resort marketing, premium real estate
websites, and social media campaigns.

Most important rule: maintain realism, neutrality, and authenticity above
everything else.
`.trim();

export const PROMPTS: Record<AiJobType, string> = {
  hdr_merge: `${LUXURY_REAL_ESTATE_BASE}

JOB: Merge these bracketed exposures of the same scene into a single
natural-looking image. Pull window detail from the dark frames. Lift shadows
from the bright frames. Produce one final 16:9 image suitable for MLS.`,

  enhance_single: `${LUXURY_REAL_ESTATE_BASE}

JOB: This is a single-exposure photo. Apply the full luxury edit pass
above. Respect the original composition. Do not crop or reframe.`,

  sky_replace: `${LUXURY_REAL_ESTATE_BASE}

JOB: The sky in this exterior photo is blown out, grey, or otherwise
unflattering. Replace it with a clean, lightly clouded blue sky that matches
the lighting direction and time of day visible in the rest of the scene.
Relight the foreground subtly to match the new sky color temperature.
Preserve the building, landscaping, and all foreground elements exactly.
Avoid dramatic, stylized, or sunset skies unless the scene already shows
golden hour.`,

  window_pull: `${LUXURY_REAL_ESTATE_BASE}

JOB: The windows in this interior are blown out. Pull the exterior view
back into the windows. Reveal what would realistically be visible outside
(do not invent landscapes — if no detail can be inferred, use a soft natural
exterior). Maintain a realistic indoor/outdoor brightness ratio. Avoid the
fake dark-glass look. Preserve all reflections, frame details, curtains,
and blinds.`,

  lawn_enhance: `${LUXURY_REAL_ESTATE_BASE}

JOB: The lawn or visible landscaping looks patchy, brown, or unhealthy.
Make it look evenly green and well-maintained. Do not change the layout of
beds, trees, pathways, or hardscape. Keep grass texture believable, never
cartoonish or astroturf-looking.`,

  declutter: `${LUXURY_REAL_ESTATE_BASE}

JOB: Light declutter pass. Remove visible personal items: mail, magazines,
charging cables, soap bottles, toothbrushes, single small items on
counters, remote controls left on couches. Do NOT remove furniture,
artwork, plants, books on shelves, or anything attached to the walls or
floor. Preserve the room's overall character and intentional styling.`,

  twilight_convert: `${LUXURY_REAL_ESTATE_BASE}

JOB: Convert this daytime exterior into a twilight shot. Sky fades from
deep blue at top to warm orange near the horizon. Add believable warm
interior lighting through windows. Keep the architecture, landscaping,
hardscape, and material colors identical. No artificial moonlight, no
stars, no streetlights that weren't already in the scene.`,

  virtual_stage: `${LUXURY_REAL_ESTATE_BASE}

JOB: Virtually stage this empty room as a {room_type}. Use modern,
mid-priced furniture appropriate for a real estate listing. Match the
room's natural lighting direction and color temperature. Cast realistic
shadows. Do not change the architecture, flooring, walls, windows, paint
color, or fixtures.`,
};

export function buildPrompt(jobType: AiJobType, extra?: string): string {
  const base = PROMPTS[jobType];
  return extra ? `${base}\n\nAdditional direction from the editor: ${extra}` : base;
}

/**
 * The base luxury real estate prompt without any job-specific direction.
 * Use this when you want the full editing philosophy text but you're going
 * to build your own action description on top (e.g. for one-off
 * AI-as-editor prompts on the lightbox).
 */
export { LUXURY_REAL_ESTATE_BASE };
