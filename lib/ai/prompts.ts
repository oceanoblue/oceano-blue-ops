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
Your task is to professionally retouch and finish the image — NEVER regenerate,
redraw, or reimagine it — as if it were edited by a top-tier architectural
photography studio for luxury real estate marketing. Treat the input as a real
photograph of a real property: keep its exact contents and only improve the
photographic quality.

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

WHITE BALANCE CONSISTENCY (ONE TEMPERATURE — IMPORTANT)
The ENTIRE image must read at a single, consistent, slightly-warm neutral white
balance. The most common failure is interiors drifting cool/blue while the
exterior or window light stays warm (or vice versa) — do NOT let that happen.
Interior walls, exterior facade, sky, and the view through windows must all sit
on the same coherent temperature, as if lit by one consistent daylight. Lock
white balance to the neutral architectural surfaces (ceilings, trim, cabinetry)
and bring everything else into agreement with them. Never deliver a photo where
one zone looks noticeably cooler or warmer than another. Aim for inviting,
warm-neutral — never clinical blue, never amber.

EXTERIOR EXPOSURE (DO NOT OVERBLOW)
Exteriors, facades, rooflines, sunlit ground, patios, and skies must NOT be
overexposed, washed out, or blown to white. Hold real detail, texture, and
color in the brightest exterior areas — a bright sunny exterior should still
show material in the walls and roof and tone in the sky. When an interior shot
includes a doorway or window to the outside, the outdoor area must stay
exposed-down enough to show its detail, not clip to a white hole. Bright and
airy, yes — bleached and detail-less, never.

COLOR (ENHANCED BUT TRUE-TO-LIFE)
Deliver rich, premium, magazine-grade color depth: deep natural greens in
foliage and lawns, clean believable blue skies, honest warm wood tones, and
saturated-yet-realistic accent colors. Add color vibrance and tonal
separation so the image reads high-end — but NEVER at the expense of white
balance. Whites, ceilings, trim, and cabinetry stay perfectly neutral; only
genuinely non-neutral surfaces gain saturation. No global warm/amber or
cool/blue cast, no oversaturation, no neon, no teal-and-orange grading.
This is the luxury signature look: bright, clean, color-accurate, with
whites that are truly white.

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

HIGHLIGHT RECOVERY & LIGHT FIXTURES (IMPORTANT)
Actively recover blown-out highlights across the whole image — in BOTH single
exposures and HDR merges — instead of leaving them as featureless white
patches. Pull overexposed areas back until shape, edges, and material detail
return:
- Light fixtures, bulbs, and shades: restore the form, rim, and material of
  every vanity light, sconce, pendant, chandelier, and lamp shade so it reads
  as a defined object, not a glowing white blob. A frosted or glass shade
  should show its rounded form and subtle tone; an exposed bulb may stay
  bright but must keep a believable edge rather than bleeding into the wall.
- Suppress the halo, glow, and bloom that spill from light sources onto
  adjacent walls, ceilings, and trim; keep those surfaces clean with their
  texture intact right up to the edge of the fixture.
- Recover detail in other clipped highlights too: sunlit walls and floors,
  bright window frames, glossy countertops, chrome and metal speculars, white
  linens, tile, and cabinetry.
Keep it natural: the lights should still read as ON and the room bright — do
not dim the scene, gray-out the whites, or make fixtures look unlit. The goal
is defined, detailed, true-to-life highlights with real material, never
crushed, gray, or dull tone.

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

TEXT, NUMBERS & SIGNAGE (CRITICAL — DO NOT ALTER)
Preserve every piece of text, numeral, and marking EXACTLY as in the original,
and keep it sharp and legible: house numbers, address numerals, mailbox and
door numbers, street and yard signs, nameplates, brand names and labels on
appliances, book and artwork titles, clocks, thermostats, and screens. Never
redraw, restyle, translate, invent, smudge, blur, or "AI-smooth" any lettering
or digits. The output must show the identical characters, in the same position,
crisp and readable — not an approximation and never garbled or fake-looking.
Treat house and address numbers as legally important: they must stay
pixel-faithful to the source. If you cannot enhance a region without risking
the accuracy of its text or numbers, leave that region untouched.

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

MLS COMPLIANCE & ACCURACY (NON-NEGOTIABLE)
The image must be a truthful, accurate representation of the property as
photographed — fit for MLS rules. Therefore:
- Do NOT add, remove, move, or alter any permanent or structural feature:
  rooms, walls, windows, doors, ceilings, flooring, cabinetry, countertops,
  built-ins, fixtures, appliances, landscaping, hardscape, or the building
  exterior.
- Do NOT virtually stage, add, or remove furniture, rugs, or decor unless an
  explicit instruction says to.
- Do NOT invent views, square footage, or finishes that aren't present.
- Allowed corrections are limited to: lighting, exposure, white balance, color,
  lens/perspective straightening, HDR balance, blown-sky/window recovery, and
  the privacy/cleanup edits explicitly requested below (photographer
  reflections, personal-photo faces). These do not change the property itself.
- No people, pets, brand/agent logos, watermarks, or text overlays.

Most important rule: maintain realism, neutrality, MLS-accurate authenticity,
and the property's true condition above everything else.
`.trim();

/**
 * Front-loaded fidelity lock for the plain enhance pass. Generative editors will
 * happily "improve" a room by swapping appliances, repainting walls, or moving
 * furniture unless told — in the strongest terms, first — that this is a retouch
 * and the content is sacred. Prepended to the enhance_single prompt.
 */
const FIDELITY_LOCK = `
FIDELITY LOCK — THIS IS A RETOUCH, NOT A REGENERATION (ABSOLUTE TOP PRIORITY)
You are retouching one existing photograph. The output must be the SAME photo of
the SAME room with the SAME contents — only better exposed, color-correct,
cleaner, and sharper. A viewer comparing the input and output must see the
identical room, just professionally finished. Reproduce every element exactly:
- Every piece of furniture, appliance, cabinet, countertop, sink, faucet,
  fixture, outlet, switch, vent, and hardware — same design, position, and count.
- Every material, finish, pattern and COLOR — wall paint color, flooring type,
  tile, wood tone, stone veining, fabric, counters — kept identical. Never
  change a wall's color, a floor's material, or a cabinet's finish.
- Every number, letter, label, screen, clock and thermostat reading, and brand
  mark — kept exactly, sharp and legible.
- Room geometry, layout, and the position of every window and door — unchanged.
Do NOT add, remove, move, swap, restyle, duplicate, or reimagine anything. If an
area cannot be improved without altering its content, leave it exactly as-is.
Improve ONLY the photographic qualities: exposure and brightness, white balance
(clean, truly neutral whites), contrast, color accuracy and depth, shadow and
highlight recovery, haze/noise reduction, and crisp-but-natural sharpness and
clarity — for a bright, clean, luxury MLS look that stays loyal to the original.
`.trim();

export const PROMPTS: Record<AiJobType, string> = {
  hdr_merge: `${LUXURY_REAL_ESTATE_BASE}

JOB: Merge these bracketed exposures of the same scene into a single
natural-looking image. Pull window detail from the dark frames. Lift shadows
from the bright frames. Produce one final 16:9 image suitable for MLS.`,

  enhance_single: `${FIDELITY_LOCK}

${LUXURY_REAL_ESTATE_BASE}

JOB: This is a single-exposure photo. Apply the full luxury finishing pass
above while obeying the FIDELITY LOCK absolutely — same room, same contents,
only better photographic quality. Respect the original composition. Do not crop
or reframe.`,

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

/**
 * Sky presets for the enhance workflow. Each maps to a concrete, conservative
 * description so output stays believable for the property's lighting and time
 * of day.
 */
export type SkyStyle =
  | 'original'
  | 'sunny_puffs'
  | 'loaded_puffs'
  | 'crisp_streaks'
  | 'clear_fade';

const SKY_DIRECTIONS: Record<Exclude<SkyStyle, 'original'>, string> = {
  sunny_puffs:
    'a clean blue sky with a few soft, scattered fair-weather cumulus puffs',
  loaded_puffs:
    'a blue sky with fuller, evenly distributed white cumulus clouds (still bright, never stormy)',
  crisp_streaks:
    'a crisp blue sky with light high cirrus streaks',
  clear_fade:
    'an almost-clear blue sky that fades to a soft lighter blue near the horizon',
};

/** Enhancement strength: Signature (full luxury finish) vs Natural (restrained). */
export type EnhancementStyle = 'signature' | 'natural';

export interface EnhanceDirectives {
  /** Free-form editor note (e.g. lightbox AI revision prompt). */
  extra?: string;
  /** Sky preset; 'original' (or omitted) means do not replace the sky. */
  skyStyle?: SkyStyle;
  /** Pull blown-out window exteriors back in when true. */
  windowPull?: boolean;
  /** Straighten verticals / correct perspective when true. */
  perspectiveCorrection?: boolean;
  /** Remove photographer/camera/tripod reflections in mirrors, TVs, glass. */
  removeReflections?: boolean;
  /** Blur/obscure human faces in personal photos & portraits on walls. */
  blurFaces?: boolean;
  /** Overall edit strength. */
  enhancementStyle?: EnhancementStyle;
}

/**
 * Turn structured listing preferences into an extra prompt block. Keeps the
 * base luxury prompt untouched and appends only the toggled capabilities, so
 * "consistent with everything, enhanced" stays the default and sky/window
 * pulls are opt-in.
 */
export function composeEnhanceDirections(d: EnhanceDirectives): string {
  const lines: string[] = [];

  if (d.enhancementStyle === 'natural') {
    lines.push(
      'STRENGTH: Natural — apply a restrained, true-to-camera edit. Subtle color and tone only.'
    );
  } else if (d.enhancementStyle === 'signature') {
    lines.push(
      'STRENGTH: Signature — apply the full luxury finish: clean bright whites, rich true-to-life color, balanced HDR-grade tone. Never overprocessed.'
    );
  }

  if (d.skyStyle && d.skyStyle !== 'original') {
    lines.push(
      `SKY: Replace any blown-out or unflattering exterior sky with ${SKY_DIRECTIONS[d.skyStyle]}. Match the lighting direction and time of day, relight the foreground subtly to suit, and preserve the building, landscaping, and all foreground elements exactly.`
    );
  }

  if (d.windowPull) {
    lines.push(
      'WINDOW PULLS: Where windows are blown out, recover realistic exterior visibility through the glass with a natural indoor/outdoor brightness ratio. Avoid the fake dark-glass look; preserve frames, mullions, reflections, curtains, and blinds.'
    );
  }

  if (d.perspectiveCorrection) {
    lines.push(
      'PERSPECTIVE: Straighten verticals and correct lens/perspective distortion while preserving realistic room proportions. Do not crop away important content.'
    );
  }

  if (d.removeReflections) {
    lines.push(
      'REFLECTIONS: Remove the photographer, camera, tripod, lights, and any crew/equipment reflections wherever they appear — in mirrors, TV and monitor screens, glass, polished appliances, and windows. Reconstruct what should plausibly be behind the reflection (room continuation or a neutral off/dark screen) so it looks naturally clean. Do not alter the mirror/TV/glass itself or anything else in the scene.'
    );
  }

  if (d.blurFaces) {
    lines.push(
      "PRIVACY: Softly blur or obscure any recognizable human faces that appear in personal photographs, portraits, and framed pictures on walls, shelves, desks, and surfaces — enough that individuals are not identifiable. Keep the frames, glass, and artwork intact; only the faces inside personal photos are obscured. Do not blur faces in generic decorative art that depicts no real, identifiable person."
    );
  }

  if (d.extra && d.extra.trim()) {
    lines.push(`EDITOR NOTE: ${d.extra.trim()}`);
  }

  return lines.join('\n\n');
}

/**
 * Build the final prompt for a job. Accepts either a plain editor note (legacy
 * callers) or a structured set of listing directives.
 */
export function buildPrompt(jobType: AiJobType, extra?: string | EnhanceDirectives): string {
  const base = PROMPTS[jobType];
  if (!extra) return base;
  const block =
    typeof extra === 'string' ? `Additional direction from the editor: ${extra}` : composeEnhanceDirections(extra);
  return block ? `${base}\n\n${block}` : base;
}

/**
 * The base luxury real estate prompt without any job-specific direction.
 * Use this when you want the full editing philosophy text but you're going
 * to build your own action description on top (e.g. for one-off
 * AI-as-editor prompts on the lightbox).
 */
export { LUXURY_REAL_ESTATE_BASE };
