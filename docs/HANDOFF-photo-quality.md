# Handoff — Real-Estate Photo Quality (resume here)

> Self-contained continuation doc for the photo-enhance quality work. Repo:
> `oceanoblue/oceano-blue-ops`. Supabase project **Oceano Blue Ops**, ref
> `hcxqqbnoextequclrvff`. Companion docs: `HANDOFF-media-pipeline.md` (§8–§10 =
> photo roadmap), `REAL_ESTATE_PHOTO_PRODUCTION_V3.md`.

## 0. TL;DR state (2026-07-01)
Everything below is **merged to `main` and deployed** (Vercel + a manual Fly
deploy of `worker-edit`, confirmed live). The pipeline works end-to-end: RAW
decode → bracket fusion (+ window-pull) → finishing grade → optional
generative edits.

**Grade tuning v4 is CONFIRMED against a real render** (kitchen photo, HDR
merge + sober grade): windows on both sides hold the tree/yard view instead of
blowing to flat white, the ceiling reads neutral white, and the overall cast
looks balanced (the remaining warmth is the room's real wood tones + accent
lighting, not a color-cast artifact). This closed out the v1→v4 tuning loop
(see §3) — no further blind tuning needed unless a different scene surfaces a
new issue.

## 1. What shipped this session (PRs #141–#150)
| PR | What |
|----|------|
| #141 | Killed the chained downscale→upscale; native masters (no fake-detail enlarge) |
| #142 | `gpt-image-2` confirmed + `input_fidelity:'high'` (staging fidelity); full RAW decode in worker-edit (rawpy/libraw); `?size=4k` delivery preset |
| #143 | Ingest RAW **original + preview**; engine processes the true RAW (mig `0048`, `photos.raw_storage_path`) |
| #144 | Production **profiles** + `project_type` enum (mig `0049`) + sober grade + ops "Photo profile" dropdown |
| #145 | Decision doc: assisted-finish model for premium tiers |
| #146 | Sober grade highlight roll-off (calibrated to references) |
| #147 | Bound fusion resolution (Vercel side) |
| #148 | **Real OOM fix**: downscale brackets BEFORE fusion in the worker |
| #149 | Sober grade **v2** — brighter/airier (v1 was too dark) |
| #150 | **Auto-exposure** (median-based) + **tint-aware white balance** (fixes green cast) |

## 2. Deploy targets (IMPORTANT — different per change)
- **App / pipeline logic** (`lib/**`, `app/**`, `components/**`) → **Vercel, auto-deploys on merge to `main`**. No action.
- **`worker-edit/**`** (the Python OpenCV/RAW engine, Fly app `oceano-edit-engine`) → **manual**: `cd worker-edit && git pull && fly deploy`. Verify: `curl https://oceano-edit-engine.fly.dev/health` → `{"ok":true,"service":"oceano-edit-engine","raw":true}` (`"raw":true` = libraw loaded).
- **`worker-local/**`** (office-Mac V3 worker) → `git pull` on the Mac. Only if that path is used.
- **DB** migrations → applied via Supabase MCP `apply_migration` (dry-run in a rolled-back txn first; run security advisor after). `0048` + `0049` already applied to prod.

## 3. Current grade parameters (the tuning starting point)
`worker-edit/server.py`, `grade(img, style)`. Order: correct_lens → auto_white_balance → auto_exposure → denoise → tone/sat/sharpen.

**v4 retune (2026-07-01), confirmed against a REAL render:** all four profiles
now route to `sober` — the owner reported the `default` style (used only by
MLS/Luxury before) was over-blowing highlights. `sober` v2 (target 0.50, gamma
0.90) then read dark/muddy against a real AutoHDR side-by-side (a bright,
evenly-lit kitchen vs. our darker/heavier output). v3 (target 0.58, gamma
0.82, gain cap 2.2) over-corrected: a real render came back with **blown
windows and a warm/sepia bloom** on the accent lighting. Root cause: the old
`auto_exposure` was a flat multiply bounded only by a fixed gain cap — a dark
room forced a big gain that hard-clipped an already-recovered window
(window-pull) straight to 255 *before* the tone curve's highlight roll-off
ever got a chance (a LUT can't un-clip a value that's already 255).

- **auto_exposure** (both styles): median luminance → target (sober **0.55**,
  default **0.52**), gain clamped **[0.6, 1.8]** (the 2.2 v3 widening is
  reverted). **New in v4:** the gain is ALSO capped so the frame's own
  97th-percentile luminance doesn't cross a 0.94 ceiling — i.e. it backs off
  the room-brightness gain when doing so would blow out whatever's already
  bright (windows, hot accent lights), instead of only the previous room-level
  gain clamp. Multiplicative, so colour ratios are preserved.
- **auto_white_balance**: anchors **all 3 channels** to the neutral patch's grey (fixes green/magenta tint + warm/cool), gains clamped [0.80, 1.25]. Not touched in v4 — the v3 render's warm bloom looked like an exposure-amplification artifact (hot accent lights blown by the too-high gain), not a WB failure; revisit this if a future render still shows a cast with exposure now under control.
- **sober** grade (now MLS/luxury/architectural/interior — the only style in
  production use): `tone_curve(black_point=1.0, contrast=0.94, airy_gamma=0.86,
  highlight_rolloff=0.35)` (gamma was 0.90 in v2, overshot to 0.82 in v3, now
  0.86), `saturate=0.98`, **no sky push**.
- **default** grade (currently unselected by any profile — kept for reference /
  a possible future punchier tier): `tone_curve(1.0, 0.90, 0.88)`, `saturate=1.0`,
  `soften_sky` on. No highlight roll-off, so it's not safe to push as bright as
  sober without re-introducing the original blown-highlight complaint.

Profiles map in `lib/photos/profiles.ts`: **all four** (`mls_real_estate`,
`luxury_real_estate`, `architectural`, `interior_design`) → `sober`. One
consistent look across profiles; `default` is currently dead code paths-wise
(still reachable via the `style` param, just not selected by any profile).

## 4. Key env vars (all have safe defaults)
| Var | Default | Where | Note |
|-----|---------|-------|------|
| `EDIT_ENGINE_URL` / `EDIT_WORKER_SECRET` | — | Vercel | point at the Fly engine; required for the deterministic path |
| `EDIT_FUSE_MAX_EDGE` | `4096` | Vercel | HDR fusion cap; raise WITH Fly RAM for bigger merges |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | Vercel | generative model |
| `OPENAI_INPUT_FIDELITY` | `high` | Vercel | preserves structure on edits/staging |
| `DELIVERY_LONG_EDGE` | `0` | Vercel | 0 = never upscale |
| `AI_INPUT_LONG_EDGE` | `6144` | Vercel | input cap to providers |

## 5. The reference look (what "good" means)
Owner's Lowcountry reference set (Southern coastal): **bright, airy, luminous, accurate** — clean neutral-to-gently-warm whites, true wood tones, muted blues stay muted, real sky (no stylized blue), windows hold their exterior view, natural shadows kept. "Not HDR-pushed" = **no gritty halos/over-contrast, NOT darker.** (Reference files `IMG_3417`–`3424` shown in chat; `IMG_3416.gif`/`IMG_3421.webp` never rendered — re-request as JPG if needed.)

## 6. Open items / next steps
1. **TUNING LOOP (next action):** the v3 retune (§3) needs a real render + `fly deploy` to confirm — judge exposure / color (green cast gone?) / window hold against the AutoHDR reference. If still too dark, next knobs to try (in order): raise sober `target` further (0.58→~0.62), lower `airy_gamma` further (0.82→~0.76), or re-check the Mertens fusion weights in `fuse()` (`createMergeMertens(0.15, 0.25, 1.0)`) — the 1.0 well-exposedness weight biases the fused base toward middle-gray before grading even starts, which may be the deeper cause if tuning the grade alone isn't enough. Can't render images in-session — verify curve math with numpy, confirm on real output.
2. **Bigger HDR masters (optional):** `fly scale memory 8192 -a oceano-edit-engine` + set `EDIT_FUSE_MAX_EDGE=6144` in Vercel.
3. **Phase B** — per-profile QC rulesets (extend `lib/ai/qc/*`, `photo_qc_reports`).
4. **Phase C** — per-profile capture checklists (data-driven UI at intake).
5. **Phase D** — assisted/auto premium finish: window-pull / flash-ambient blend (the last-mile magazine look on extreme-DR scenes), per-profile AI QC. Decided model: MLS = full auto; luxury/architectural/interior = system-assisted human finish, automating stages as they prove out.

## 7. Gotchas
- **This sandbox can't reach `*.fly.dev`** (network policy 403) — health checks + live engine tests must be run by the owner, or add the host to the env allowlist.
- **Worker-edit changes need a manual `fly deploy`** — they do NOT ride the Vercel deploy. A stale `/health` (missing `"raw"`) = old build; pull + redeploy.
- **RAW ingest** uploads original + preview → larger/slower uploads (intended; full quality). The uploader has a compression toggle (off by default).
- **HDR fusion is capped at `EDIT_FUSE_MAX_EDGE` (4096)** for memory; single-frame grade stays native.
- **Generative jobs can't take RAW** — RAW routes to the deterministic engine only.
- **Diagnosing failures:** `select job_type,status,model,error_message,created_at from ai_jobs order by created_at desc limit 10;` — `model:null` + error = failed; the RAW path now surfaces the real engine error (no sharp red-herring).

## 8. How to operate (ops)
1. Order page → **Photo profile** dropdown (MLS / Luxury / Architectural / Interior).
2. Upload (RAW or JPEG) → run **AI Enhance** (HDR sets auto-merge then grade).
3. Download via delivery presets: `full` (native master), `4k`, `print` (3000), `web` (2048).
