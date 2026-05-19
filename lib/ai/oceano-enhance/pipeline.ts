import sharp from 'sharp';
import type { Sharp } from 'sharp';

/**
 * Oceano Enhance pipeline — deterministic real-estate retouch built on Sharp
 * (which is libvips under the hood). The goal is to do everything a Lightroom
 * Auto preset does, but server-side, in a single pass, with zero hallucination
 * risk. Generation models are only used when a job genuinely requires
 * semantic edits (sky replacement, twilight conversion, virtual staging).
 *
 * Stages applied in order:
 *   1. Decode + normalize orientation
 *   2. Resize to 3000px on the long edge (sRGB, 8-bit)
 *   3. Auto white balance via the "grey world" assumption
 *   4. Tone curve: lift shadows, recover highlights, gentle mid-tone contrast
 *   5. Subtle vibrance boost (saturate non-skin tones a touch more)
 *   6. Light denoise + capture sharpen
 *   7. Output as MozJPEG q92
 *
 * All knobs are tuned for interior real-estate shots that come out of a
 * mirrorless body at base ISO. They're intentionally conservative so the
 * output passes MLS review without further tweaks.
 */

export interface EnhanceOptions {
  /** Long-edge in pixels. MLS standard is 3000–4000; we default to 3000. */
  targetLongEdge?: number;
  /** 0..1, how aggressively to lift shadows. */
  shadowLift?: number;
  /** 0..1, how aggressively to recover highlights. */
  highlightRecover?: number;
  /** 0..1, vibrance amount. */
  vibrance?: number;
  /** JPEG quality 1..100. */
  jpegQuality?: number;
}

const DEFAULTS: Required<EnhanceOptions> = {
  targetLongEdge: 3000,
  // More aggressive defaults so the output looks visibly cleaner than the
  // raw. Real estate listings need to "pop" — agents reject subtle edits.
  shadowLift: 0.55,
  highlightRecover: 0.55,
  vibrance: 0.3,
  jpegQuality: 92,
};

/** Resize to long-edge target, preserving aspect, no upscaling. */
async function resize(img: Sharp, opts: Required<EnhanceOptions>): Promise<Sharp> {
  const meta = await img.metadata();
  if (!meta.width || !meta.height) return img;
  const longEdge = Math.max(meta.width, meta.height);
  if (longEdge <= opts.targetLongEdge) return img;
  const ratio = opts.targetLongEdge / longEdge;
  return img.resize({
    width: Math.round(meta.width * ratio),
    height: Math.round(meta.height * ratio),
    fit: 'inside',
    kernel: 'lanczos3',
    withoutEnlargement: true,
  });
}

/**
 * Grey-world white balance: scale R and B channels so that the average of
 * each channel matches the average of green. Works great for typical
 * mixed-light interiors without going crazy on red couches or blue accent
 * walls.
 */
async function whiteBalance(buf: Buffer): Promise<Buffer> {
  const stats = await sharp(buf).stats();
  const [r, g, b] = stats.channels;
  if (!r || !g || !b) return buf;
  const targetMean = (r.mean + g.mean + b.mean) / 3;
  // Tame the correction so we don't over-shift; bias 60% toward neutral.
  const blend = 0.6;
  const rGain = 1 + ((targetMean / r.mean) - 1) * blend;
  const bGain = 1 + ((targetMean / b.mean) - 1) * blend;
  return sharp(buf)
    .linear([rGain, 1, bGain], [0, 0, 0])
    .toBuffer();
}

/**
 * Tone curve: parabolic shadow lift + highlight roll-off implemented as a
 * lookup against the luminance channel. Sharp ships `.linear()` for gain/bias
 * and `.modulate()` for HSL, but neither does proper local-tone work, so we
 * approximate with two passes:
 *   - Linear shadow lift (gentle gain on the bottom half)
 *   - Highlight knee (apply gamma > 1 to the top quarter)
 */
async function toneCurve(
  buf: Buffer,
  shadowLift: number,
  highlightRecover: number
): Promise<Buffer> {
  // Shadow lift: add an offset that fades toward white. We use linear(a, b)
  // where the offset brightens shadows more than highlights and a small gain
  // dip prevents the whole image from feeling washed out.
  const lift = shadowLift * 32; // up to 32 levels (12% of 255)
  const liftGain = 1 - shadowLift * 0.05;

  // Highlight recovery via gamma. Higher gamma compresses highlights, pulling
  // window detail back without crushing the rest.
  const highlightGamma = 1 + highlightRecover * 0.4; // up to 1.4

  // Mid-tone contrast (parametric S-curve approximation): apply a second
  // gentle gamma in the opposite direction to boost separation in the middle
  // of the histogram where most of the photo lives.
  const midContrast = 1 / (1 + (shadowLift + highlightRecover) * 0.05);

  return sharp(buf)
    .linear(liftGain, lift)
    .gamma(highlightGamma)
    .gamma(midContrast)
    .toBuffer();
}

/**
 * Vibrance: saturate without crushing already-saturated hues. Sharp's modulate
 * does a flat saturation multiplier, which over-saturates clients' red brick
 * walls. We approximate vibrance by lightly bumping saturation only.
 */
async function vibrance(buf: Buffer, amount: number): Promise<Buffer> {
  if (amount <= 0) return buf;
  const saturation = 1 + amount * 0.5; // up to 1.5x
  return sharp(buf)
    .modulate({ saturation })
    .toBuffer();
}

/** Mild denoise + capture sharpen pair. Subtle on purpose. */
async function denoiseSharpen(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .median(1) // 1-pixel median: kills hot pixels, preserves edges
    .sharpen({ sigma: 0.8, m1: 0.6, m2: 1.5 })
    .toBuffer();
}

/** Run the full single-image pipeline. */
export async function enhanceSingle(
  inputBuf: Buffer,
  options?: EnhanceOptions
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const opts: Required<EnhanceOptions> = { ...DEFAULTS, ...options };

  // 1. Decode + orient + resize
  let img = sharp(inputBuf, { failOn: 'none' }).rotate().toColorspace('srgb');
  img = await resize(img, opts);
  let buf = await img.toBuffer();

  // 2. White balance
  buf = await whiteBalance(buf);

  // 3. Tone curve
  buf = await toneCurve(buf, opts.shadowLift, opts.highlightRecover);

  // 4. Vibrance
  buf = await vibrance(buf, opts.vibrance);

  // 5. Denoise + sharpen
  buf = await denoiseSharpen(buf);

  // 6. Final JPEG encode
  const final = await sharp(buf)
    .jpeg({ quality: opts.jpegQuality, mozjpeg: true, progressive: true })
    .toBuffer();

  const meta = await sharp(final).metadata();
  return {
    bytes: final,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

/**
 * Exposure-fusion HDR merge from a 3/5/7 bracketed set. This is the Mertens
 * algorithm in spirit (weight pixels by well-exposedness × contrast ×
 * saturation, then blend), simplified for Sharp's available primitives.
 *
 * We approximate by:
 *   1. Aligning brackets to the same dimensions
 *   2. Computing a per-pixel weight map for each bracket favouring well-lit,
 *      contrasty, saturated pixels
 *   3. Compositing each bracket onto a base layer weighted by that map
 *
 * Output then goes through the same single-image pipeline so it looks
 * consistent with the rest of the gallery.
 */
export async function mergeBrackets(
  brackets: Array<{ bytes: Buffer; bracketIndex?: number }>,
  options?: EnhanceOptions
): Promise<{ bytes: Buffer; width: number; height: number }> {
  if (brackets.length === 0) throw new Error('No brackets provided');
  if (brackets.length === 1) return enhanceSingle(brackets[0].bytes, options);

  // Sort by exposure bias ascending — darkest first, brightest last
  const sorted = brackets
    .slice()
    .sort((a, b) => (a.bracketIndex ?? 0) - (b.bracketIndex ?? 0));

  // Normalize all brackets to the same dimensions (use the first as reference)
  const refMeta = await sharp(sorted[0].bytes).metadata();
  if (!refMeta.width || !refMeta.height) throw new Error('Could not read bracket dimensions');
  const W = refMeta.width;
  const H = refMeta.height;

  const normalized = await Promise.all(
    sorted.map((b) =>
      sharp(b.bytes)
        .resize({ width: W, height: H, fit: 'cover' })
        .toColorspace('srgb')
        .toBuffer()
    )
  );

  // Build the well-exposedness weight for each bracket. We compute a per-pixel
  // distance-from-mid-grey, invert it, and use that as the alpha for an
  // additive composite. Brackets near the midtones contribute most where
  // they're best exposed.
  //
  // For simplicity we use Sharp's `composite` with the brightest bracket as a
  // base and overlay the others with a soft alpha derived from luminance.
  // True Mertens fusion needs Laplacian pyramids — we'll add that in a later
  // pass once we wire libraw + a worker queue.
  const base = normalized[Math.floor(normalized.length / 2)]; // middle exposure

  // Overlay shadows (brightest bracket masked to dark areas of the base)
  const brightest = normalized[normalized.length - 1];
  const shadowMask = await sharp(base)
    .greyscale()
    .linear(-1, 255) // invert so dark = bright in the mask
    .gamma(2.2)
    .toBuffer();
  const shadowOverlay = await sharp(brightest)
    .composite([{ input: shadowMask, blend: 'dest-in' }])
    .toBuffer();

  // Overlay highlights (darkest bracket masked to bright areas of the base)
  const darkest = normalized[0];
  const highlightMask = await sharp(base)
    .greyscale()
    .gamma(2.2)
    .toBuffer();
  const highlightOverlay = await sharp(darkest)
    .composite([{ input: highlightMask, blend: 'dest-in' }])
    .toBuffer();

  // Stack: base + lifted shadows + recovered highlights
  const fused = await sharp(base)
    .composite([
      { input: shadowOverlay, blend: 'over' },
      { input: highlightOverlay, blend: 'over' },
    ])
    .toBuffer();

  // Run through the single-image pipeline for final WB / tone / sharpen
  return enhanceSingle(fused, options);
}
