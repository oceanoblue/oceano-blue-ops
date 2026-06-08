# Oceano Blue Production OS — Complete Handoff (everything to date)

Date: 2026-06-08 · Repo: `oceanoblue/oceano-blue-ops`
Stack: Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres +
Storage + Auth) · Vercel.

> **Sanitized checkpoint/status handoff.** This file intentionally contains **no
> secrets** — no API tokens/keys, no webhook URLs, no authorization headers, no
> Make blueprint, and no Dropbox/Airtable/YouTube/Make connection identifiers
> beyond high-level descriptions. Credential placeholders (e.g. `<token>`,
> `<ref>`, env-var names) are illustrative only. Live Supabase migrations and
> AssemblyAI key rotation are tracked here as **pending operational steps** (§3).

---

## 0. Executive summary

The app has been evolved from a real-estate-photography ops tool into the
foundation of the **Oceano Blue Production OS** (company-wide production
operating system), plus the first real workflow on top of it (**Real Estate
Photo Rescue**, v1 + v2). All of it is **merged into `main`**. Two operational
steps remain before the next feature: **apply the DB migrations to live Supabase**
and **rotate the leaked AssemblyAI key**. The next feature (**Podcast Production
Engine v1**) is fully designed with decisions locked, but **not started** (gated
on those two steps).

---

## 1. Current git / PR state (verified against GitHub)

- **`main` is the trunk**, HEAD = merge commit **`98636bb`**, and contains
  **everything**: legacy real estate app + Production OS foundation + Photo
  Rescue v1 + v2.
- **PR #3** (Production OS Foundation + Real Estate Photo Rescue) — **MERGED** to `main`.
- **PR #4** (Photo Rescue v2 visual review) — **MERGED** (into `production-os-foundation`, now contained in `main`).
- Branches `production-os-foundation` and `photo-rescue-v2-visual-review` are
  **fully merged (0 commits ahead of main)** → **safe to delete**. (I could not
  delete them from the sandbox — the git remote rejects ref deletion and no
  delete-branch tool was available — so delete them in the GitHub UI.)
- Migrations on `main`: `0001`–`0014` (legacy) + **`0015`–`0025`** (new).

---

## 2. What was delivered

### 2a. Production OS foundation (Phase 1) — migrations `0015`–`0024`
40 new tables alongside the legacy 10, grouped:
- **Foundation:** user_profiles, project_members, client_profiles, projects, job_types, jobs
- **Assets:** storage_locations, assets, asset_versions, asset_groups, asset_group_items
- **Workflow:** workflow_templates, workflow_runs, workflow_steps, tool_runs
- **AI/tools:** ai_models, agents, prompt_templates, ai_tasks, tools, integrations, external_links, approval_policies, approvals
- **Automation/podcast/video:** automation_scenarios, podcast_shows, podcast_episodes, podcast_deliverables, transcripts, edit_recipes, resolve_projects
- **Review/QC/delivery:** review_sessions, review_comments, qc_reports, quality_score_events, delivery_versions
- **Worker/editor/events:** local_workers, worker_tasks, editor_assignments, production_events

Plus: internal-only RLS (`is_internal_user()`), perf indexes, `updated_at`
triggers, **seeds** (14 job types, 5 workflow templates, 11 agents, 4 AI models,
14 tools, 14 integrations, 7 approval policies), 5 workflow-as-code JSON files,
and **nullable bridge columns** on legacy tables (orders/photos/ai_jobs/
delivery_links/listings — no backfill).

Dashboard shell pages: command-center, projects, jobs, jobs/[id] (tabbed),
assets, workflows, reviews, automations, integrations, deliveries. Two-group
sidebar (Production OS + Real Estate). Legacy real estate app untouched.

### 2b. Real Estate Photo Rescue v1 (in PR #3)
Browser ingest (EXIF read locally, **metadata only** — originals stay local),
HDR bracket detection that **reuses** the two existing detectors
(`lib/photos/bracket-grouping.ts` + `lib/ai/bracket-detect.ts`) reconciled in
`lib/photos/asset-bracket-detect.ts` with confidence scores; manual correction
UI (merge/split/role/reject/mark-reviewed); `real_estate_photo_qc` report.
Routes: `/api/re-photo/{ingest,groups,qc,jobs}`. Pages: `/dashboard/photo-rescue`,
`/dashboard/jobs/[id]/photo-rescue`. Minimal RE-photo job creator for end-to-end use.

### 2c. Real Estate Photo Rescue v2 — visual review (PR #4) — migration `0025`
- **Thumbnails:** browser generates small previews (canvas for JPEG/PNG/WebP,
  `exifr.thumbnail` for RAW), uploads **only previews** to a new **private
  `thumbnails` bucket**; path stored in `assets.thumbnail_url`; rendered in
  review + a **contact sheet** (`/jobs/[id]/photo-rescue/contact-sheet`).
- **Scene classification foundation:** `interior|exterior|drone|twilight|
  amenity|detail|unknown` in `assets.metadata.scene` (`scene_source`
  heuristic|manual|ai); heuristic at ingest, manual override
  (`/api/re-photo/scene`), optional AI (`/api/re-photo/classify`, gpt-4o-mini
  over thumbnails, no-ops without `OPENAI_API_KEY`).
- **Tests:** vitest added; `lib/photos/asset-bracket-detect.test.ts` (5 tests).
  Test caught a real bug → `REVIEW_THRESHOLD` lowered 0.85 → **0.80**.
- Routes added: `/api/re-photo/{thumbnails,scene,classify}`.

### 2d. Validation at merge (head now in `main`)
build ✓ · typecheck 0 new errors (142 pre-existing baseline) · vitest 5/5 ·
lint clean (new files) · Vercel CI green · migrations `0015`–`0025` apply +
idempotent on Postgres 16 · route DB writes verified on Postgres.

---

## 3. ⚠️ Pending operational steps (NOT done — required before next feature)

These cannot be performed from the ephemeral build sandbox (no prod secrets,
project not linked — verified: all `SUPABASE_*` env unset, no `.env`, not linked).

1. **Apply migrations `0015`–`0025` to LIVE Supabase** — owner/CI must run.
   ```bash
   export SUPABASE_ACCESS_TOKEN=<token>
   supabase projects list            # confirm correct project ref/name FIRST
   supabase link --project-ref <ref>
   supabase migration list           # confirm 0015–0025 pending
   npm run db:push
   ```
   If history isn't CLI-tracked, paste `0015`→`0025` (in order) into the Supabase
   SQL editor — they're idempotent. **Until applied, the new Production OS pages
   error at runtime; the existing real estate app keeps working.**

   Post-apply verification (Supabase SQL editor):
   ```sql
   -- 40 tables → expect 40
   select count(*) from information_schema.tables
   where table_schema='public' and table_name in (
    'user_profiles','project_members','client_profiles','projects','job_types','jobs',
    'storage_locations','assets','asset_versions','asset_groups','asset_group_items',
    'workflow_templates','workflow_runs','workflow_steps','tool_runs',
    'ai_models','agents','prompt_templates','ai_tasks','tools','integrations','external_links','approval_policies','approvals',
    'automation_scenarios','podcast_shows','podcast_episodes','podcast_deliverables','transcripts','edit_recipes','resolve_projects',
    'review_sessions','review_comments','qc_reports','quality_score_events','delivery_versions',
    'local_workers','worker_tasks','editor_assignments','production_events');
   -- seeds → 14,5,11,4,14,14,7
   select (select count(*) from job_types),(select count(*) from workflow_templates),
          (select count(*) from agents),(select count(*) from ai_models),
          (select count(*) from tools),(select count(*) from integrations),
          (select count(*) from approval_policies);
   -- RLS active → true
   select bool_and(relrowsecurity) from pg_class
   where relname in ('jobs','assets','projects','tool_runs','delivery_versions','production_events');
   -- thumbnails bucket → 1 row, public=false
   select id, public from storage.buckets where id='thumbnails';
   ```
2. **Rotate the AssemblyAI key** (it was exposed, hardcoded in the Make
   blueprint's HTTP headers) and move it into a Make connection.
3. **Delete the two merged branches** (housekeeping).

---

## 4. Next feature — Podcast Production Engine v1 (designed, NOT started)

Wrap the existing Make.com "Defining Wealth" podcast scenario so **Make stays the
runtime** and **Production OS is the source of truth**. Full design lives in the
separate `PODCAST_PRODUCTION_ENGINE_V1_HANDOFF.md` (Make→POS table mapping,
callback/trigger contracts, blueprint review of all 15 modules, manual gate).

### LOCKED decisions (from owner)
1. **Dual-write to Airtable** during v1 — POS is source of truth; Make also keeps
   updating Airtable as a temporary bridge until proven. Keep
   `podcast_episodes.metadata.airtable_record_id` for reconciliation; retire later.
2. **Auto-upload to YouTube as *unlisted* is an allowed draft/review step** (no
   approval). **Public / client-facing / final delivery / "make public" requires
   human approval** (`approval_policies` + `approvals`; `delivery_versions` stays
   `internal_review` until approved).
3. **One generic Make scenario keyed by `show_slug`** (not per-show) — single
   `automation_scenarios` row; `show_slug` travels in trigger/callback payloads.
4. **Transcript stored in `transcripts` (source of truth)**, also linked as an
   `asset` (type `transcript`) / `podcast_deliverable` where useful. **Dropbox is
   a `storage_locations` entry, not the source of truth.**

### Planned build (when gates clear)
1. Branch **`podcast-engine-v1` from `main`**.
2. Migration `0026`: `podcast_shows.slug` (unique) + `metadata`; optional
   `transcripts.metadata`. (Everything else fits existing jsonb/text columns;
   `external_links.link_type`, `tool_runs.provider`, `ai_tasks.task_type` are
   text → no enum migration.)
3. Seed the generic `automation_scenarios` row + the Defining Wealth
   `podcast_shows` row.
4. `POST /api/automations/make/callback` — shared-secret auth
   (`POS_AUTOMATION_SECRET`), event-discriminated
   (`intake|transcription.completed|copy.generated|youtube.uploaded|delivered|
   scenario.failed`), idempotent on (make_execution_id, event), dual-write-aware.
5. `POST /api/automations/make/trigger` (POS → Make) + dashboard "Run/Re-run".
6. Podcast episode UI: status timeline (from `production_events`), transcript,
   generated copy, deliverables, YouTube link, and the **publish-approval gate**.
7. typecheck/build/test/lint → open PR for review.

### Map of current Make flow → POS tables (reference)
automation_scenarios (the scenario) · jobs(job_type podcast_episode)+podcast_episodes ·
assets (source video) + storage_locations (Dropbox) · transcripts (AssemblyAI) ·
ai_tasks (Claude copy) · podcast_deliverables + delivery_versions (YouTube) ·
external_links (dropbox/youtube/airtable/assemblyai) · tool_runs (parent
make_scenario + child per call) · production_events (timeline).

---

## 5. Conventions for the next contributor
- Server reads via `createClient()` (`@/lib/supabase/server`); system writes via
  `createAdminClient()` after an auth check.
- Tailwind component classes (`.card`, `.pill`, `.btn-*`, `.input`, `.table-head`);
  `lucide-react` icons.
- Migrations additive + idempotent; **next file is `0026_*.sql`**.
- `next.config.js` ignores TS/ESLint at build (142-error legacy baseline); keep
  new code at 0 new errors. Hand-written `lib/supabase/database.types.ts`;
  `re-photo`/automation write routes cast the admin client `as any` (column
  correctness verified on Postgres). Regenerate types via Supabase CLI when able.
- Don't commit `tsconfig.tsbuildinfo`. Run typecheck/build/test before pushing.

---

## 6. Security (must respect)
- **Rotate the AssemblyAI key** (exposed in the blueprint). Don't commit the
  blueprint; never copy the token anywhere.
- Secrets live only in Make connections / env (`POS_AUTOMATION_SECRET` for
  POS↔Make). POS rows store ids + URLs only — never tokens/PII.
- New POS tables are internal-only RLS; don't expose to client/portal users yet.
- Don't put production Supabase credentials into the build sandbox; run live DB
  changes from a trusted machine/CI.

---

## 7. In-repo docs (on `main`)
- `docs/PRODUCTION_OS_PHASE1_HANDOFF.md`
- `docs/REAL_ESTATE_PHOTO_RESCUE_HANDOFF.md`
- `docs/PHOTO_RESCUE_V2_HANDOFF.md`
(Plan-only docs delivered out-of-repo: Podcast Engine v1, post-merge checkpoint,
this master handoff.)

---

## 8. Immediate next actions (in order)
1. Apply migrations `0015`–`0025` to live Supabase + run the verification SQL (§3).
2. Rotate the AssemblyAI key.
3. Delete merged branches `production-os-foundation` + `photo-rescue-v2-visual-review`.
4. Confirm both gates → branch `podcast-engine-v1` from `main` → build per §4.

Guardrail: no new feature work until `main` is confirmed live-correct and the two
gates are met.
