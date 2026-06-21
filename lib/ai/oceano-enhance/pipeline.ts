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
  /** JPEG quality 1..100. */
  jpegQuality?: number;

  // ─── BASIC ────────────────────────────────────────────────────────────
  /** Global exposure adjustment in stops. Range -2..+2, default 0. */
  exposure?: number;
  /** Global contrast adjustment. Range -1..+1, default 0. */
  contrast?: number;

  // ─── COLOR ────────────────────────────────────────────────────────────
  /** White balance temperature shift. -1..+1 (cool→warm), default 0. */
  temp?: number;
  /** White balance tint shift. -1..+1 (green→magenta), default 0. */
  tint?: number;
  /** Saturation multiplier. -1..+1, default 0. */
  saturation?: number;

  // ─── TONE ─────────────────────────────────────────────────────────────
  /** Highlights recovery, -1..+1, default 0 (positive = darken bright areas). */
  highlights?: number;
  /** Shadows lift, -1..+1, default 0 (positive = brighten dark areas). */
  shadows?: number;
  /** Whites — top of the curve. -1..+1, default 0. */
  whites?: number;
  /** Blacks — bottom of the curve. -1..+1, default 0. */
  blacks?: number;

  // ─── DETAIL ───────────────────────────────────────────────────────────
  /** Sharpening amount, 0..1, default 0.25. */
  sharpening?: number;

  // ─── Legacy (kept for backwards compat with Settings page) ────────────
  /** Legacy: maps to a combination of shadows + tone curve. */
  shadowLift?: number;
  /** Legacy: maps to highlights recovery. */
  highlightRecover?: number;
  /** Legacy: maps to saturation. */
  vibrance?: number;
}

const DEFAULTS: Required<EnhanceOptions> = {
  targetLongEdge: 3000,
  jpegQuality: 92,
  exposure: 0,
  contrast: 0,
  temp: 0,
  tint: 0,
  saturation: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  sharpening: 0.25,
  // Legacy fallbacks — only used when the new fields are all zero AND a
  // legacy value is provided. Lets old settings keep working until they're
  // updated to the new schema.
  shadowLift: 0,
  highlightRecover: 0,
  vibrance: 0,
};

/**
 * The signature "luxury real estate" grade applied to every auto-enhance when
 * the operator hasn't dialed in their own settings. The all-zero DEFAULTS above
 * are a true no-op (used by the manual slider route); THIS is the opinionated
 * look. Tuned against how best-in-class services (Fotello "Airy", Autoenhance,
 * BoxBrownie, PhotoUp) actually grade: neutral-clean white balance, bright &
 * airy via shadow lift (not a blown global push), STRONG highlight recovery so
 * windows/exteriors stay legible, whites held just below clip, a hair of black
 * lift for airiness over a true black point, gentle contrast, restrained/
 * realistic colour (oversaturation is the #1 "fake" tell), crisp edge-aware
 * sharpening. Restraint + accuracy is what reads as luxury, not stronger fx.
 * Override per-deployment via DB settings.
 */
export const LUXURY_BASELINE: EnhanceOptions = {
  exposure: 0.25, // airy lift, moderate so exteriors don't blow
  contrast: 0.08, // gentle S, not an HDR slam
  temp: 0.0, // neutral — white-patch WB sets the white point; no warm cast
  saturation: 0.1, // modest + realistic; oversaturation looks fake
  highlights: 0.35, // strong recovery: hold window & sunlit-exterior detail
  shadows: 0.3, // open the corners for the bright/airy look (don't crush wood)
  whites: 0.0, // keep the brightest whites just below clip
  blacks: -0.03, // a hair of lift for "airy"; contrast keeps a true black point
  sharpening: 0.3, // crisp, edge-aware, no crunch
};

/**
 * Translate legacy options (shadowLift / highlightRecover / vibrance) onto
 * the new field set so the pipeline doesn't need two code paths.
 */
function normalizeOptions(opts: EnhanceOptions): Required<EnhanceOptions> {
  const merged: Required<EnhanceOptions> = { ...DEFAULTS, ...opts };
  // If the caller is on the old API, map the legacy values onto the new ones
  // only when the new fields are still at default 0.
  if (opts.shadowLift != null && opts.shadows == null) {
    merged.shadows = (opts.shadowLift - 0) * 1.1; // 0..1 → 0..+1.1 stops of shadow lift
  }
  if (opts.highlightRecover != null && opts.highlights == null) {
    merged.highlights = opts.highlightRecover * 1.1; // 0..1 → 0..+1.1 recovery
  }
  if (opts.vibrance != null && opts.saturation == null) {
    merged.saturation = opts.vibrance * 0.6; // 0..1 → 0..+0.6 saturation
  }
  return merged;
}

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
 * Compute per-channel gains that neutralize a measured bright-neutral colour,
 * anchored to green, tamed by `blend` and clamped so we never wildly shift.
 * Pure + exported for testing.
 */
export function wbGains(
  rm: number,
  gm: number,
  bm: number,
  blend = 0.7
): { rGain: number; bGain: number } {
  const clamp = (x: number) => Math.max(0.82, Math.min(1.22, x));
  const rGain = rm > 0 ? clamp(1 + (gm / rm - 1) * blend) : 1;
  const bGain = bm > 0 ? clamp(1 + (gm / bm - 1) * blend) : 1;
  return { rGain, bGain };
}

/**
 * White-patch white balance on bright neutrals.
 *
 * Grey-world (balance to the whole-scene average) injects colour casts whenever
 * a frame is dominated by non-neutral content — e.g. a real-estate interior
 * with warm wood floors comes out with magenta walls and blue shadows. Instead
 * we sample the brightest, not-yet-clipped pixels (the white walls/ceiling/trim
 * that SHOULD be neutral) and balance off those. Falls back to a no-op when
 * there aren't enough neutral references to trust.
 */
async function whiteBalance(buf: Buffer): Promise<Buffer> {
  let data: Buffer;
  let info: { width: number; height: number; channels: number };
  try {
    const out = await sharp(buf)
      .resize(160, 160, { fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = out.data;
    info = out.info;
  } catch {
    return buf;
  }
  const px = info.width * info.height;
  const ch = info.channels;
  if (px === 0 || ch < 3) return buf;

  // Luminance per pixel; take the brightest ~20% as candidate neutrals.
  const lum = new Float32Array(px);
  for (let i = 0; i < px; i++) {
    const o = i * ch;
    lum[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }
  const thresh = Float32Array.from(lum).sort()[Math.floor(px * 0.8)];

  let rs = 0;
  let gs = 0;
  let bs = 0;
  let n = 0;
  for (let i = 0; i < px; i++) {
    if (lum[i] < thresh) continue;
    const o = i * ch;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    // Skip pixels that are essentially clipped — pure white carries no cast info.
    if (r >= 252 && g >= 252 && b >= 252) continue;
    rs += r;
    gs += g;
    bs += b;
    n += 1;
  }
  if (n < 20) return buf; // not enough trustworthy neutral references

  const { rGain, bGain } = wbGains(rs / n, gs / n, bs / n);
  return sharp(buf).linear([rGain, 1, bGain], [0, 0, 0]).toBuffer();
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

  // Highlight recovery via gamma. Sharp's `.gamma()` only accepts values
  // between 1.0 and 3.0; higher values compress highlights, pulling window
  // detail back. Clamp to 1.0 so we never throw.
  const highlightGamma = Math.max(1.0, 1 + highlightRecover * 0.4); // up to 1.4

  // Slight global contrast bump via .linear() with a centered gain. We add a
  // small gain > 1 around mid-grey and offset it back down so blacks stay
  // black and whites don't clip.
  const contrastGain = 1 + (shadowLift + highlightRecover) * 0.06;
  const contrastBias = -((contrastGain - 1) * 128);

  return sharp(buf)
    .linear(liftGain, lift)
    .gamma(highlightGamma)
    .linear(contrastGain, contrastBias)
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

// ─── Lightroom-style controls implemented on Sharp ─────────────────────────

/**
 * Exposure in stops: multiply pixel values by 2^stops. Sharp's `.linear()`
 * accepts a gain and clamps automatically.
 */
async function applyExposure(buf: Buffer, stops: number): Promise<Buffer> {
  if (Math.abs(stops) < 0.01) return buf;
  const gain = Math.pow(2, stops);
  return sharp(buf).linear(gain, 0).toBuffer();
}

/**
 * Contrast adjustment via `.linear(gain, bias)` pivoting around mid-grey (128).
 */
async function applyContrast(buf: Buffer, amount: number): Promise<Buffer> {
  if (Math.abs(amount) < 0.01) return buf;
  const gain = 1 + amount * 0.5; // ±50% gain range
  const bias = -(gain - 1) * 128;
  return sharp(buf).linear(gain, bias).toBuffer();
}

/**
 * Temperature (warm/cool) shift implemented as per-channel gain:
 * positive = warm (boost R, dim B), negative = cool (dim R, boost B).
 */
async function applyTemp(buf: Buffer, amount: number): Promise<Buffer> {
  if (Math.abs(amount) < 0.01) return buf;
  const k = amount * 0.25; // up to ±25% channel shift
  return sharp(buf)
    .linear([1 + k, 1, 1 - k], [0, 0, 0])
    .toBuffer();
}

/**
 * Tint (green/magenta) shift: positive = magenta (boost R+B, dim G),
 * negative = green (dim R+B, boost G).
 */
async function applyTint(buf: Buffer, amount: number): Promise<Buffer> {
  if (Math.abs(amount) < 0.01) return buf;
  const k = amount * 0.2;
  return sharp(buf)
    .linear([1 + k, 1 - k, 1 + k], [0, 0, 0])
    .toBuffer();
}

/**
 * Saturation via Sharp's `.modulate()`.
 */
async function applySaturation(buf: Buffer, amount: number): Promise<Buffer> {
  if (Math.abs(amount) < 0.01) return buf;
  const saturation = Math.max(0, 1 + amount * 0.7);
  return sharp(buf).modulate({ saturation }).toBuffer();
}

/**
 * Highlights: positive amount darkens highlights (recovery).
 * We use gamma to compress the top of the curve.
 */
async function applyHighlights(buf: Buffer, amount: number): Promise<Buffer> {
  if (Math.abs(amount) < 0.01) return buf;
  // Positive = pull highlights back: gamma > 1.0
  // Negative = brighten highlights: not supported directly by sharp.gamma (which needs >= 1.0)
  if (amount > 0) {
    const gamma = Math.min(3.0, 1 + amount * 0.6);
    return sharp(buf).gamma(gamma).toBuffer();
  }
  // For negative highlights (boost), use linear gain biased to bright values
  const gain = 1 + Math.abs(amount) * 0.15;
  const bias = -(gain - 1) * 128;
  return sharp(buf).linear(gain, bias).toBuffer();
}

/**
 * Shadows: positive amount lifts shadows. linear(gain, bias) with mild gain
 * and small positive bias keeps highlights stable while pulling shadows up.
 */
async function applyShadows(buf: Buffer, amount: number): Promise<Buffer> {
  if (Math.abs(amount) < 0.01) return buf;
  // Bias-dominant: brighten dark pixels more than highlights
  const bias = amount * 28;
  const gain = 1 - amount * 0.04;
  return sharp(buf).linear(gain, bias).toBuffer();
}

/**
 * Whites: tops out the curve. Positive amount pushes near-whites up
 * (more clipping risk), negative pulls them down.
 */
async function applyWhites(buf: Buffer, amount: number): Promise<Buffer> {
  if (Math.abs(amount) < 0.01) return buf;
  const gain = 1 + amount * 0.1;
  return sharp(buf).linear(gain, 0).toBuffer();
}

/**
 * Blacks: bottom of the curve. Positive amount crushes blacks (deeper);
 * negative lifts them.
 */
async function applyBlacks(buf: Buffer, amount: number): Promise<Buffer> {
  if (Math.abs(amount) < 0.01) return buf;
  // Negative bias deepens blacks (positive amount), positive bias lifts.
  const bias = -amount * 16;
  return sharp(buf).linear(1, bias).toBuffer();
}

/**
 * Sharpening. The `amount` is 0..1 mapped onto Sharp's sigma + m1 + m2.
 */
async function applySharpening(buf: Buffer, amount: number): Promise<Buffer> {
  if (amount <= 0.01) return buf;
  // Edge-focused: keep m1 (flat-area sharpening) at ~0 so we don't amplify
  // sensor noise into visible grain in smooth/shadow regions; put the strength
  // on m2 (edges) for crisp detail. m1 was the main cause of grain on dark shots.
  return sharp(buf)
    .sharpen({
      sigma: 0.5 + amount * 0.6,
      m1: 0,
      m2: 1.2 + amount * 1.6,
    })
    .toBuffer();
}

/** Run the full single-image pipeline. */
export async function enhanceSingle(
  inputBuf: Buffer,
  options?: EnhanceOptions
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const opts = normalizeOptions(options ?? {});

  // 1. Decode + orient + resize
  let img = sharp(inputBuf, { failOn: 'none' }).rotate().toColorspace('srgb');
  img = await resize(img, opts);
  let buf = await img.toBuffer();

  // 2. Auto white balance (grey world) — always run as a baseline so the
  // photo starts neutral. Subsequent temp/tint sliders shift from there.
  buf = await whiteBalance(buf);

  // 3. Exposure (global brightness in stops)
  buf = await applyExposure(buf, opts.exposure);

  // 4. Color: temp, tint, saturation
  buf = await applyTemp(buf, opts.temp);
  buf = await applyTint(buf, opts.tint);

  // 5. Tone curve in Lightroom order: highlights → shadows → whites → blacks
  buf = await applyHighlights(buf, opts.highlights);
  buf = await applyShadows(buf, opts.shadows);
  buf = await applyWhites(buf, opts.whites);
  buf = await applyBlacks(buf, opts.blacks);

  // 6. Contrast (after tone curve so it scales the whole histogram)
  buf = await applyContrast(buf, opts.contrast);

  // 7. Saturation
  buf = await applySaturation(buf, opts.saturation);

  // 8. Mild denoise + sharpening
  buf = await sharp(buf).median(1).toBuffer();
  buf = await applySharpening(buf, opts.sharpening);

  // 9. Final JPEG encode
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

// ─── Preset profiles ────────────────────────────────────────────────────────
// Quick named looks the user can apply with one click. Each preset is just a
// partial EnhanceOptions; the editor merges them onto the current slider
// state. Photographers can later save their own under "MY PROFILES".

export const ENHANCE_PRESETS: Record<string, Partial<EnhanceOptions>> = {
  signature: {
    exposure: 0.1,
    contrast: 0.15,
    temp: 0,
    saturation: 0.1,
    highlights: 0.4,
    shadows: 0.55,
    whites: 0.05,
    blacks: -0.05,
    sharpening: 0.3,
  },
  natural: {
    exposure: 0,
    contrast: 0,
    temp: 0,
    saturation: 0,
    highlights: 0.25,
    shadows: 0.25,
    sharpening: 0.2,
  },
  airy: {
    exposure: 0.3,
    contrast: -0.1,
    temp: -0.1,
    saturation: 0.05,
    highlights: 0.55,
    shadows: 0.7,
    whites: 0.1,
    blacks: -0.1,
    sharpening: 0.25,
  },
  crisp: {
    exposure: 0,
    contrast: 0.4,
    temp: 0.05,
    saturation: -0.05,
    highlights: 0.5,
    shadows: 0.45,
    whites: 0.05,
    blacks: 0.1,
    sharpening: 0.55,
  },
};

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
  // and decode to raw sRGB bytes for a per-pixel blend.
  const refMeta = await sharp(sorted[0].bytes).metadata();
  if (!refMeta.width || !refMeta.height) throw new Error('Could not read bracket dimensions');
  const W = refMeta.width;
  const H = refMeta.height;

  const frames = await Promise.all(
    sorted.map((b) =>
      sharp(b.bytes)
        .resize({ width: W, height: H, fit: 'cover' })
        .toColorspace('srgb')
        .removeAlpha()
        .raw()
        .toBuffer()
    )
  );

  // Base-preserving exposure recovery.
  //
  // A plain well-exposedness average pulls every pixel toward mid-grey, which
  // flattens contrast (washed-out, lifted blacks). Instead we KEEP the
  // well-exposed middle (≈0 EV) frame in the midtones — preserving its natural
  // contrast — and only borrow from the extremes where the middle frame fails:
  //   • blown highlights  → pull from the DARKEST frame (recovers window/sky)
  //   • blocked shadows   → pull from the BRIGHTEST frame (clean shadow detail,
  //                          which also avoids the grain you get from lifting the
  //                          dark frame's own noisy shadows)
  // Midtones come straight from the base, so contrast and a true black point are
  // retained. Weights ramp smoothly so there are no hard seams.
  const darkest = frames[0];
  const brightest = frames[frames.length - 1];
  const base = frames[Math.floor(frames.length / 2)];
  const px = W * H;
  const out = Buffer.allocUnsafe(px * 3);
  const HI_START = 170; // base luminance where highlight recovery begins
  const LO_START = 85; // base luminance where shadow recovery begins
  const MAX_W = 0.85; // cap so the base never fully disappears at the extremes

  for (let i = 0; i < px; i++) {
    const o = i * 3;
    const L = (base[o] * 299 + base[o + 1] * 587 + base[o + 2] * 114) / 1000;
    let wH = 0;
    let wS = 0;
    if (L > HI_START) wH = ((L - HI_START) / (255 - HI_START)) * MAX_W;
    else if (L < LO_START) wS = ((LO_START - L) / LO_START) * MAX_W;
    const wB = 1 - wH - wS;
    out[o] = ((base[o] * wB + darkest[o] * wH + brightest[o] * wS) + 0.5) | 0;
    out[o + 1] = ((base[o + 1] * wB + darkest[o + 1] * wH + brightest[o + 1] * wS) + 0.5) | 0;
    out[o + 2] = ((base[o + 2] * wB + darkest[o + 2] * wH + brightest[o + 2] * wS) + 0.5) | 0;
  }

  const fused = await sharp(out, { raw: { width: W, height: H, channels: 3 } })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();

  // Run through the single-image pipeline for final WB / tone / sharpen
  return enhanceSingle(fused, options);
}
