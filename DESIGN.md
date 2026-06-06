# DESIGN.md — Oceano Blue Media

> A `DESIGN.md` spec (per the [getdesign.md](https://getdesign.md) convention) that
> captures Oceano Blue Media's visual language so any AI coding agent — or human —
> builds new pages/components perfectly on-brand. This is the single source of truth
> for the marketing site's look, feel, and motion.

## Brand

- **Who:** Oceano Blue Media — a cinematic video production & photography studio in
  Old Town Bluffton, SC (the Lowcountry).
- **Personality:** Cinematic, editorial, confident, warm, hand-crafted. Premium but
  human — "a small crew with a cinematic obsession."
- **Voice:** Short, declarative, a little poetic. Lowercase-cool, never corporate.
  e.g. _"Cinematic stories for bold brands."_ / _"We don't describe it. We show it."_
- **Aesthetic direction:** **Bold editorial** — oversized type, strong grid,
  high-contrast color blocks, magazine-style layout, full-bleed cinematic media.

## Color

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0B0B0E` | Primary dark bg, text on light |
| `paper` | `#F3EFE6` | Primary warm-white bg, text on dark |
| `bone` | `#E7E1D4` | Deeper paper, image placeholders |
| `ocean` (DEFAULT) | `#1452F0` | Electric brand blue — accents, CTAs, progress |
| `ocean.deep` | `#0A1E46` | Deep navy section background |
| `ocean.mid` | `#0C3FB0` | Hover / mid blue |
| `ocean.soft` | `#9EC1FF` | Light blue for accents on dark |
| `coral` | `#FF5A36` | Editorial pop / "live" indicators (use sparingly) |
| `sand` | `#E8C36B` | Warm secondary accent (rare) |

**Rhythm:** alternate section backgrounds for contrast — `paper` → `ink` →
`ocean.deep` → `paper`. Never two identical heavy darks back-to-back unless one is
full-bleed media.

## Typography

- **Display — Fraunces** (`--font-display`), light weight (300), tight tracking
  (`-0.02em` to `-0.03em`), line-height `0.86–0.95`. Use **italic** for emphasis
  words (often in `ocean.soft` on dark). This carries the brand.
- **Grotesk — Archivo** (`--font-grotesk`): body copy, UI, nav. Extra-bold uppercase
  for the wordmark.
- **Mono — Space Mono** (`--font-mono`): kickers, labels, meta, counters.

**Kicker pattern:** `font-mono`, `text-[0.7rem]`, `uppercase`, `tracking: 0.28em`,
usually in `ocean` (light bg) or `ocean.soft` (dark bg).

**Fluid display sizes** (in `tailwind.config.ts`):
- `text-mega` — `clamp(3rem, 13vw, 12rem)` — hero only
- `text-giant` — `clamp(2.5rem, 8vw, 7rem)` — section headlines
- `text-huge` — `clamp(2rem, 5vw, 4.5rem)` — sub-headlines

## Layout & spacing

- Max content width: `1680px` (`max-w-edge`); use the `.container-edge` helper.
- Horizontal padding: `1.25rem` → `2rem` → `3rem` (`px-edge`).
- Section vertical rhythm: `py-20 sm:py-28` (standard), `py-24 sm:py-32` (feature).
- Corners: **sharp/`rounded-sm`** for editorial feel; pills (`rounded-full`) only for
  buttons and tags.
- Hairlines: `border-*/15–20` for dividers.

## Components

- **Buttons** (`.btn` base): `.btn-solid` (ink→ocean), `.btn-blue` (ocean→deep),
  `.btn-outline` (color set per call-site). All `rounded-full`, uppercase, tracked.
- **Tags/pills:** thin bordered, mono, uppercase, `0.65rem`.
- **Cards/tiles:** full-bleed image with `from-ink/70` bottom gradient, caption rises
  on hover, circular arrow button that fills `ocean` on hover.
- **Marquee:** Fraunces light, asterisk separators, pause on hover.
- **Animated underline:** `.link-underline` (background-size sweep).

## Motion (the differentiator)

- **Smooth scroll:** Lenis, driven by GSAP's ticker. `duration ~1.15`.
- **Signature easing:** `cubic-bezier(0.16, 1, 0.3, 1)` (`ease-editorial`). Standard
  durations 0.3–1.1s.
- **Scroll reveals:** `[data-reveal]` fades/rises in via IntersectionObserver
  (`Reveal` provider); optional `data-reveal-delay`.
- **Scroll-driven sequences (GSAP ScrollTrigger):** pinned, **scrubbed & reversible** —
  word-by-word manifesto build; pinned multi-scene cross-fade/scale showcase.
- **Parallax:** `[data-parallax="0.05"]` on media inside an over-scaled, clipped wrapper.
- **Hero:** full-bleed video, masked line-by-line headline reveal unlocked by a
  cinematic preloader (`html.loaded`).
- **Custom cursor:** blend-mode ring + dot, expands over interactive elements
  (desktop / `pointer: fine` only).
- **Hover-play:** work tiles play muted video on hover (desktop).
- **Showreel:** click → fullscreen video lightbox.

## Imagery

- Cinematic, editorial, color-graded (teal shadows / warm highlights). Subjects:
  Lowcountry marsh & coast, the bright **white-cyclorama studio**, film/photo craft,
  twilight real estate, editorial portraits, brand still-life.
- Treatments: subtle **film grain** overlay on dark hero/media bands; gradient
  scrims (`from-ink`) for text legibility.
- **Never** use dark "warehouse soundstage" imagery — the studio is a bright,
  clean, white-cyc space.

## Accessibility & resilience

- Honor `prefers-reduced-motion`: disable smooth scroll, scrubbing, parallax,
  reveals → show content statically.
- All scroll-pinning gated to desktop (`min-width: 768px`); mobile gets clean
  stacked fallbacks.
- Maintain strong contrast (paper on ink, ink on paper). Keep body copy ≥ `1rem`.

## Stack

Next.js 14 (App Router) · Tailwind CSS · GSAP ScrollTrigger · Lenis ·
lucide-react · deployed on Vercel.
