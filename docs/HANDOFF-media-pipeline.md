# Handoff — Media Production Pipeline (reels / long-form / podcasts)

> Pick up here in a new Claude Code web session that has **both** repos as sources:
> `oceanoblue/oceano-blue-ops` (this repo — ops app + Supabase + workers) and
> `oceanoblue/Website` (client-facing site, where the next piece goes).
> Everything below is already merged to `main`.

## 0. First thing in the new session
Confirm both repos are in scope:
- Read something from `oceanoblue/Website` (e.g. list its branches) — if denied, the
  session wasn't created with it; recreate the session including both repos. The
  Claude GitHub app must also have access to `oceanoblue/Website`
  (GitHub → Settings → Applications → Claude → Configure).

Supabase project: **Oceano Blue Ops**, ref `hcxqqbnoextequclrvff` (region us-east-1).
(There's also an unrelated "Immersive Experience" project — ignore it.)

## 1. What this is
A general **media-production pipeline**: clients submit orders + footage; the team
plans the edit; an engine renders; a human approves before delivery.

- **Reel + long-form video** → office-Mac **DaVinci Resolve daemon** (built, see §4).
- **Podcasts** → existing **Make.com** pipeline (`podcast_shows/episodes/deliverables`,
  Transistor + YouTube). **Untouched on purpose** — do not reroute without asking.
- **Real-estate photos** → deterministic edit engine (`worker-edit/`) + optional
  generative edits (gpt-image-2). **RESUMED** — being dialed in. See §8 (resolution
  audit) and §9 (RAW + generative fidelity) for the June 2026 quality work.

## 2. What's shipped (Phase 1 + Phase 2 engine)
| PR | What |
|----|------|
| #135 | `order_kind` enum (`shoot`/`reel_edit`), `reel_briefs`, `order_footage`, **`client-footage`** bucket (first client-writable; per-client path isolation), `SECURITY DEFINER` RPCs `create_reel_order` / `add_reel_footage` / `submit_reel_order` |
| #136 | Client reel intake wizard `/portal/reels/new` + `/portal/reels`, resumable footage upload (`lib/storage/tus-upload.ts`), "Create a reel" CTA |
| #137 | Ops reel view on `/dashboard/orders/[id]`: brief + footage video previews + **edit-instructions DSL editor** (`reel_briefs.edit_instructions`) |
| #138 | `order_kind += long_form_edit`; **`edit_jobs`** queue; **`reel-renders`** bucket; worker `edit_video` capability; worker API `/api/worker/edit/{claim,context,upload-url,complete}`; ops **"Send to edit engine"** button |
| #139 | **`worker-resolve/`** office-Mac daemon (cut planner + Resolve driver + API client) |

Migrations applied to prod: `0046_reel_orders.sql`, `0047_edit_jobs.sql`.

## 3. Architecture / data flow
```
Client (portal, soon Website) ── create order + brief + footage ──▶ orders / reel_briefs / order_footage
Team (ops /dashboard) ── save edit plan ──▶ reel_briefs.edit_instructions
Team ── "Send to edit engine" ──▶ POST /api/reels/enqueue-edit ──▶ edit_jobs (queued)
Office Mac daemon ── claim/context/upload-url/complete ──▶ renders to reel-renders ──▶ order = 'ready' (review gate)
```
- Orders are keyed to a `listing`. Reel/long-form orders with no property attach to a
  per-client **"Brand Content"** listing (auto-created in `create_reel_order`).
- Edit jobs are a **dedicated queue** (`edit_jobs`), separate from the photo
  `worker_tasks` queue (which binds to production-OS `jobs`).

### DB objects added
- Enums: `order_kind('shoot','reel_edit','long_form_edit')`, `reel_type('monologue','qa','testimonial','montage')`
- Tables: `reel_briefs` (1:1 order; brief + `edit_instructions` jsonb), `order_footage`, `edit_jobs`
- Buckets: `client-footage` (client-writable, 2 GB/file, video MIME, path `=<client_id>/<order_id>/<file>`), `reel-renders` (private; worker uploads via signed URL; client reads own via order)
- RPCs (authenticated, ownership re-derived): `create_reel_order(p_brief jsonb)`, `add_reel_footage(...)`, `submit_reel_order(p_order_id)`
- Helpers reused: `current_client_id()`, `is_team_member()`, `set_updated_at()`

### Worker API contract (Bearer `obw_` key, capability `edit_video`)
- `POST /api/worker/edit/claim {max}` → `[{id, order_id, edit_plan}]`
- `GET /api/worker/edit/context?edit_job_id=` → `{brief, edit_plan, footage:[{filename,role,url(6h)}]}`
- `POST /api/worker/edit/upload-url {edit_job_id, filename}` → signed upload URL into `reel-renders` (path fixed server-side)
- `POST /api/worker/edit/complete {edit_job_id, status, result_path,...}` → on done: order → `ready`; on fail: re-queue ≤3 attempts

## 4. Office-Mac daemon (`worker-resolve/`)
Runs on the Mac (Resolve is desktop-only). See `worker-resolve/README.md`.
- `cutplan.py` — PURE, unit-tested silence-gap planner (`test_cutplan.py`, 5 tests).
- `resolve_runner.py` — Resolve driver; **the only thing CI can't test — validate against the installed Resolve version on first render.**
- `daemon.py` — `python3 daemon.py` (loop), `--once`, `--plan <edit_job_id>`, `DRY_RUN=1`.
- Setup: enable Resolve external scripting; `pip install -r requirements.txt`; register a worker with the `edit_video` capability (curl in README) to get the `obw_` key; set `OPS_BASE_URL` + `OCEANO_WORKER_KEY`.

## 5. Next tasks (in priority order)
1. **[Website repo] Client UI** — port/build the client intake + login in `oceanoblue/Website`
   against the same Supabase backend (anon key + URL; magic-link like `/portal`). It calls the
   SAME RPCs and `client-footage` upload flow. Reference implementation lives in this repo:
   `components/portal/ReelIntakeWizard.tsx`, `app/portal/reels/*`, `lib/storage/tus-upload.ts`,
   `lib/reels/types.ts`. Decide: does the Website become the primary client portal (and the
   ops-app `/portal` redirect to it), or stay marketing-only with a login that deep-links here?
2. **[ops repo] Long-form intake** — generalize the wizard to also create `long_form_edit`
   orders (a Reel/Long-form toggle). Backend already supports it; only UI + `create_reel_order`
   pathway need the kind. (Small, fully unblocked — can be done anytime.)
3. **[Mac] Stand up + validate the daemon** — first real render; tune crops/transcription;
   add a `launchd` plist so it survives reboot.
4. **Optional**: route podcast orders through the same intake/queue (additive; Make stays runtime).
5. **Later**: resume real-estate photo engine tuning (`worker-edit/server.py`) — paused.

## 6. Standing rules / how we work
- Branch → PR → CI (`verify` = typecheck) → **squash-merge** → sync `main`. One PR per change.
- Owner granted: **open PR, merge, deploy, migrate** autonomously.
- Migrations: **dry-run in a rolled-back txn first**, then `apply_migration`; run the security
  advisor after DDL.
- Secrets: never commit keys/tokens/Make blueprints/webhook URLs; owner sets Vercel/Fly env;
  don't paste secrets in chat. Production actions on Supabase/Make/etc. need owner approval
  (the standing grant covers the build/deploy/migrate cycle).
- Never put the model identifier in commits/PRs/code.
- Cost decision (for when models get wired — NOT yet): go direct — OpenAI (GPT Image; `gpt-image-1`
  retires 2026-10-23 → use 1.5), Google Gemini (Nano Banana), BytePlus ModelArk (Seedance);
  keep Higgsfield only for unique motion effects; Artlist needs Enterprise API.

## 7. Reference
- DaVinci Resolve engineering handoff (cut algorithm §5–6, MCP cookbook):
  uploaded as `RESOLVE_MCP_HANDOFF.md` in the original chat (not in repo) — the daemon's
  `cutplan.py` already implements §5–6.
- This repo's CI check is named `verify` (typecheck only); tests via `vitest run` (121 passing).

## 8. Photo resolution audit (June 2026 — PR #141)
**Symptom:** finals looked soft/wrong after the V3 Photo Production changes.
**Root cause:** full-res detail was discarded in *stacked* stages, then the result
was *upscaled back up* (interpolated = fake detail). Path was 8K → 4096 (ingest) →
4096 (AI input prep) → 3000/4000 (enhance) → upscaled to 3840 ("delivery").

**Fixed (PR #141, no new infra):**
- `lib/ai/runner.ts`: `DELIVERY_LONG_EDGE` 3840→**0** (never upscale); `AI_INPUT_LONG_EDGE` 4096→**6144**.
- `lib/ai/oceano-enhance/pipeline.ts`: `targetLongEdge` 3000→**0** (native; resize guarded for ≤0).
- `lib/ai/oceano-enhance/index.ts`: fuse/grade `targetLongEdge`→**0** (native), grade q90→95.
- `worker-local/src/process.mjs`: resize caps 4096→**8192** safety bound; base JPEG q94→95.
- `lib/photos/compress-image.ts` + `PhotoManager.tsx`: ingest compression **OFF by default**
  (full-size originals); when on, ≤6144px @ q0.95 (was 4096/0.88).
- Display-only thumbnails (`photo-url` w=640/2000, 512px grids) were **not** the cause — unchanged.

**Operational:** larger/slower uploads now (full-size). Toggle in the uploader re-enables
compression per shoot. App + ingest changes are live on Vercel; `worker-local` needs a
`git pull` on the office Mac.

## 9. RAW decode + generative fidelity (June 2026 — PR #142)
- **Generative model = `gpt-image-2`** (`lib/ai/openai-gpt-image.ts`, default; env
  `OPENAI_IMAGE_MODEL`). NOT gpt-image-1.
- **`input_fidelity: 'high'`** now set on every `images.edit` call (env `OPENAI_INPUT_FIDELITY`).
  This is THE switch that makes API edits preserve structure/fixtures/windows like the chat
  surface does — without it the model drifts. Falls back gracefully if a model rejects the param.
- **Full RAW decode** in `worker-edit` (`rawpy`/libraw): `_decode()` tries cv2 first, then a
  full libraw demosaic + camera WB for `.arw/.cr2/.nef/.dng/…`. `/health` reports `"raw": true`.
  `worker-edit` default `target_long_edge` 4000→0 (native), q90→95.
- **`runner.ts` is RAW-safe**: RAW inputs pass original bytes straight to the deterministic
  engine (sharp can't decode RAW). Generative providers can't ingest RAW → RAW should target
  the deterministic path.
- **Delivery presets** (`app/api/delivery/[token]/download`): added **`?size=4k`** (4096px q95)
  alongside `full` (native master), `print` (3000), `web` (2048) → native + 4K-floor dual delivery.

**Needs deploy:** `worker-edit` must be redeployed to Fly for RAW decode (`fly deploy` in
`worker-edit/`). gpt-image + delivery + runner changes are Vercel-side (live on merge).

**OPEN DECISION (ingest of RAW originals):** RAW full decode only helps end-to-end once the
RAW *original* reaches the engine. Ingest currently uploads the camera's embedded JPEG preview
(~6MB) for RAW, not the RAW file. Flipping ingest to store RAW originals (25–50MB each) enables
true RAW quality but means much slower uploads / more storage — confirm with owner before changing
`PhotoManager.tsx` RAW upload path.

## 10. Photo production profiles — roadmap (June 2026, PR #144 starts it)
Owner's vision (refined from a GPT proposal): the market a shoot is for, chosen
at order creation, drives the whole downstream finish. Implemented as **ONE
parameterized pipeline + per-market profiles**, NOT four forked pipelines (the
proposal's "shared components" point is right; its "independent editing logic"
framing is not — don't fork).

**Profiles** (`lib/photos/profiles.ts`, `orders.project_type` enum, mig 0049):
- `mls_real_estate` — fast/bright/clean/consistent → grade `default` (current look)
- `luxury_real_estate` — elevated marketing → grade `default` for now (premium
  flash-blend is Phase D)
- `architectural` — accurate, sober, documentary, **not HDR-pushed** → grade `sober`
- `interior_design` — faithful colour/texture, editorial → grade `sober`

**Phase A — DONE (PR #144):** `project_type` column + profiles config + the
**`sober` grade** in `worker-edit` (neutral tone: no airy gamma lift, real tonal
range, restrained saturation, **no sky-softening push**; vs the airy luxury
`default`). Threaded end-to-end: runner reads `orders.project_type` → profile →
`AiRequest.gradeStyle` → oceano-enhance grade → edit-engine `style` form field →
`grade(img, style)`. Ops set it via the **Photo profile** dropdown on the order
page. Needs the worker-edit Fly redeploy (same one as RAW) to take effect.

**Phase B — per-profile QC rulesets.** Extend existing QC (`lib/ai/qc/wall-check`,
`photo_qc_reports`) with profile-scoped checks (MLS: verticals/blown windows/HDR
halos; architectural: paint+wood colour accuracy, believable window views).

**Phase C — per-profile capture checklists.** Data-driven guidance shown at
capture/intake (bracket counts, flash/ambient frames, detail shots).

**Phase D — assisted/auto premium editing (BIG).** Owner's north star is to
**auto-produce** luxury/architectural finals (flash/ambient blend, window pull,
reflection/object cleanup, dodge & burn). Honest status: magazine-grade AUTO for
these is a long arc — today's deterministic + gpt-image tooling can't hit it in
one shot. Path: (1) profile enables the generative ops it needs; (2) build a
multi-pass blend (ambient base + flash blend + masked window pull) in worker-edit;
(3) per-profile AI QC assistant gates the result. Sequence after A–C land and
real architectural/interior samples exist to tune against.

**Per-profile generative ops & delivery** are declared in the profile shape but
not yet enforced — wire enable/disable + `deliveryDefault` when Phase B lands.
