# Handoff — Real-Estate Photo Quality (resume here)

> Self-contained continuation doc for the photo-enhance quality work. Repo:
> `oceanoblue/oceano-blue-ops`. Supabase project **Oceano Blue Ops**, ref
> `hcxqqbnoextequclrvff`. Companion docs: `HANDOFF-media-pipeline.md` (§8–§10 =
> photo roadmap), `REAL_ESTATE_PHOTO_PRODUCTION_V3.md`.

## 0. TL;DR state (June 2026)
Everything below is **merged to `main` and deployed**. The pipeline works
end-to-end: RAW decode → bracket fusion → finishing grade → optional generative
edits. The `ai_jobs` log is green (fuse-v1, grade-v1, gpt-image-2 all completing).
**The only open item is grade tuning** — it's been tuned against the math + the
owner's reference screenshots, but needs confirmation on real rendered output.

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

**v3 retune (2026-07-01):** all four profiles now route to `sober` (see below) —
the owner reported the `default` style (used only by MLS/Luxury before) was
over-blowing highlights, and `sober` v2 (target 0.50, gamma 0.90) still read
dark/muddy against a real AutoHDR side-by-side comparison the owner sent
(a bright, evenly-lit kitchen vs. our darker/heavier output on a similar room).
Reasoned math-only tune below; **needs confirmation on a real render** (this
sandbox can't render photos or reach `*.fly.dev`).

- **auto_exposure** (both styles): median luminance → target (sober **0.58**,
  default **0.52**), gain clamped **[0.6, 2.2]** (was 1.8 — a dim single-frame
  source with no fusion headroom could hit the old cap short of target),
  multiplicative. Exposes for the ROOM; windows handled by the roll-off (global
  multiply can't hold a bright window AND lift a dark room — that's Phase D).
- **auto_white_balance**: anchors **all 3 channels** to the neutral patch's grey (fixes green/magenta tint + warm/cool), gains clamped [0.80, 1.25].
- **sober** grade (now MLS/luxury/architectural/interior — the only style in
  production use): `tone_curve(black_point=1.0, contrast=0.94, airy_gamma=0.82,
  highlight_rolloff=0.35)` (gamma was 0.90 in v2 — lowered for more midtone
  lift), `saturate=0.98`, **no sky push**.
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
