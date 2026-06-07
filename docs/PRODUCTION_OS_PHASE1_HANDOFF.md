# Oceano Blue Production OS
## Phase 1 → Phase 2 Handoff Document

Prepared for: Gustavo Rattia / Oceano Blue Media
Repo: `oceanoblue/oceano-blue-ops`
Branch with Phase 1 work: `production-os-foundation`
Stack: Vercel, Supabase (Postgres), Next.js 14 (App Router), TypeScript, Tailwind
Date: 2026-06-07

> This document hands off the **completed Phase 1 foundation** to the next
> agent/session (e.g. ChatGPT/Codex/Claude). It explains exactly what now
> exists in the repo, how it's structured, what was deliberately left out,
> and the recommended next build (Real Estate Photo Rescue). Read this before
> writing any code so you don't duplicate or break what's already there.

---

## 0. TL;DR

Phase 1 evolved the repo from a real-estate-photo platform into the
foundation of the full **Oceano Blue Production OS**, **without breaking any
existing feature**. It added 40 new database tables, conservative RLS, seed
data, workflow-as-code JSON, and a new dashboard shell with a Command Center
and a Job Detail page. Everything was validated: production build passes, no
new typecheck errors, and all migrations apply + are idempotent on a real
Postgres 16 engine.

The next recommended PR is **Real Estate Photo Rescue** (better ingest, full
file detection, bracket grouping with confidence, manual correction UI, QC).

---

## 1. What exists after Phase 1

### 1.1 New database schema (40 tables, migrations `0015`–`0024`)

All tables were **added alongside** the existing real estate tables. Nothing
was deleted or rewritten. The universal model is:

```text
clients (existing)
  → client_profiles        (Client DNA)
  → projects
    → jobs
      → assets
      → workflow_runs → workflow_steps → tool_runs
      → qc_reports
      → review_sessions → review_comments
      → delivery_versions
      → production_events   (universal timeline)
```

Tables by migration file:

| File | Layer | Tables |
|------|-------|--------|
| `0015_production_os_foundation.sql` | Foundation | `user_profiles`, `project_members`, `client_profiles`, `projects`, `job_types`, `jobs` |
| `0016_production_os_assets.sql` | Asset layer | `storage_locations`, `assets`, `asset_versions`, `asset_groups`, `asset_group_items` |
| `0017_production_os_workflow.sql` | Workflow engine | `workflow_templates`, `workflow_runs`, `workflow_steps`, `tool_runs` |
| `0018_production_os_ai_tools.sql` | AI control plane + registry | `ai_models`, `agents`, `prompt_templates`, `ai_tasks`, `tools`, `integrations`, `external_links`, `approval_policies`, `approvals` |
| `0019_production_os_automation_media.sql` | Automation + podcast + video | `automation_scenarios`, `podcast_shows`, `podcast_episodes`, `podcast_deliverables`, `transcripts`, `edit_recipes`, `resolve_projects` |
| `0020_production_os_review_qc_delivery.sql` | Review + QC + delivery | `review_sessions`, `review_comments`, `qc_reports`, `quality_score_events`, `delivery_versions` |
| `0021_production_os_worker_editor_events.sql` | Worker + outsourcing + events | `local_workers`, `worker_tasks`, `editor_assignments`, `production_events` |
| `0022_production_os_bridge_columns.sql` | Bridge columns | nullable FKs on `orders`, `photos`, `ai_jobs`, `delivery_links`, `listings` |
| `0023_production_os_indexes_triggers_rls.sql` | Perf + security | all indexes, `updated_at` triggers, RLS policies |
| `0024_production_os_seed.sql` | Seed data | job types, workflow templates, agents, models, tools, integrations, approval policies |

### 1.2 Key design decisions (important — follow these going forward)

- **Status/type columns are `text` with documented defaults, NOT Postgres
  enums.** Allowed values are listed in SQL comments above each table. This
  was a deliberate choice for fast-evolving Phase 1 vocabularies. **Validate
  allowed values in the app layer (Zod), not the DB.** If you later want DB
  enforcement, add `CHECK` constraints rather than converting to enums.
- **Primary keys** are `uuid default gen_random_uuid()`. `jobs` also has a
  human-friendly `job_number serial`.
- **`updated_at`** is maintained by the existing `set_updated_at()` trigger
  function (reused, not redefined). Triggers are attached only to tables that
  have an `updated_at` column.
- **`metadata jsonb default '{}'`** exists on most tables as an escape hatch
  for extra fields before they earn a real column.
- **`production_events`** is the new universal activity log. The old
  `activity_log` table still exists and is untouched; new events should go to
  `production_events`.

### 1.3 Row Level Security

- New helper: `is_internal_user()` (security definer). Returns true if the
  current user is an active `team_members` row (existing model) **or** an
  active `user_profiles` row with an internal role
  (`owner|admin|producer|editor|photo_editor|video_editor`).
- Every new table has RLS enabled with a single policy:
  `for all using (is_internal_user()) with check (is_internal_user())`.
- **Phase 1 is internal-only.** Client and external-editor scoping (so a
  client sees only `client-visible` approved records, an external editor sees
  only assigned jobs) is **not** implemented yet — that's a later phase.

### 1.4 Bridge columns (no backfill performed)

All nullable, no data migrated:

```text
orders.job_id                    → jobs(id)
photos.asset_id                  → assets(id)
ai_jobs.tool_run_id              → tool_runs(id)
delivery_links.delivery_version_id → delivery_versions(id)
listings.project_id              → projects(id)
listings.job_id                  → jobs(id)
```

Mapping intent (for when backfill happens later):
`orders → jobs`, `photos → assets`, `ai_jobs → tool_runs`,
`delivery_links → delivery_versions`, `listings → real estate metadata on
projects/jobs`.

### 1.5 Seed data (idempotent — safe to re-run)

- **14 job types** (`real_estate_photo`, `real_estate_video`, `portrait_headshot`, `commercial_photo`, `commercial_video`, `restaurant_reel`, `podcast_episode`, `podcast_clip_package`, `testimonial`, `event_highlight`, `homepage_hero`, `social_cutdown`, `legal_tv_commercial`, `training_video`)
- **5 workflow templates** linked to job types (real estate photo, podcast episode, commercial video, portrait/headshot, restaurant reel)
- **11 agents**, **4 AI models** (with role arrays), **14 tools** (with `risk_level` + `requires_approval`), **14 integrations** (all `not_connected`), **7 approval policies**

### 1.6 Workflow-as-code (`/workflows/*.json`)

Five JSON files mirror the seeded templates with concrete step lists:
`real-estate-photo-standard.json`, `podcast-episode-standard.json`,
`commercial-video-standard.json`, `restaurant-reel-standard.json`,
`portrait-headshot-standard.json`. These are **not yet loaded by code** — they
document the intended steps and can be used to populate
`workflow_templates.definition` and to materialize `workflow_steps` in a later
phase.

### 1.7 UI / navigation

- `components/layout/Sidebar.tsx` now has **two groups**:
  - **Production OS**: Command Center, Projects, Jobs, Clients, Assets,
    Workflows, Reviews, Automations, Integrations, Deliveries, Settings
  - **Real Estate** (preserved): Overview, Orders, Schedule, Listings, Photos,
    Products
- New pages under `app/dashboard/` (all server components,
  `export const dynamic = 'force-dynamic'`):
  - `command-center/` — live job buckets (Today, New Ingests, In Progress,
    Needs AI/Human Review, Waiting on Editor, Ready to Deliver, Overdue) +
    Failed Automations from `tool_runs`.
  - `jobs/` + `jobs/[id]/` — **Job Detail is the most important page.** It has
    the tab structure from the master doc: Overview, Brief, Assets, Workflow,
    AI Plan, Automations, Review, QC, Delivery, Activity. Overview, Assets,
    Workflow, and Activity tabs are wired to data; the rest are Phase 1
    placeholders.
  - `projects/`, `assets/`, `workflows/`, `reviews/`, `automations/`,
    `integrations/`, `deliveries/` — list/shell pages reading their tables with
    empty states.

### 1.8 TypeScript types

`lib/supabase/database.types.ts` is **hand-written** (no local Supabase CLI in
this environment). The 40 new tables were registered in the `Database["public"]
["Tables"]` map; the heavily-queried ones have hand-typed interfaces, the rest
use a permissive `AnyTable<Record<string, unknown>>`. **When you wire up the
Supabase CLI, regenerate this file** (`npm run db:types`) for canonical join/RPC
typing and delete the hand-written shapes.

---

## 2. How it was validated (so you can trust it)

- `npm run build` — succeeds; all 10 new routes compile.
- `npm run typecheck` — **0 new errors** from Phase 1 files. (The repo has 142
  pre-existing errors on `main`; the production build ignores TS/ESLint via
  `next.config.js`, which is why it still deploys.)
- Migrations were applied to a throwaway **Postgres 16** instance with a
  minimal Supabase `auth` shim (`auth.users` + `auth.uid()`): base schema
  (`0001`) + `0015`–`0024` all apply cleanly, and `0023`/`0024` are idempotent
  on re-run (no duplicate seed rows).

> Note: migrations were validated locally but **not** applied to the live
> Supabase project. Apply via `npm run db:push` or your deploy pipeline.

---

## 3. What was intentionally NOT built in Phase 1

Do not assume these exist:

- Full DaVinci Resolve automation (only `resolve_projects` table exists).
- Full AI video editing (only `edit_recipes` structure exists).
- The Make.com callback route `/api/automations/make/callback` (doc marks it
  "later"). Payload contract to implement later:
  `{ "tool_run_id": "uuid", "status": "completed", "output": {}, "error": null }`.
- Local worker runtime / worker API endpoints (`worker_register`,
  `worker_heartbeat`, `scan_folder`, `generate_thumbnails`). Only the
  `local_workers` / `worker_tasks` tables exist.
- Client portal rebuild, billing/invoicing, analytics dashboards.
- Client/external-editor RLS scoping.
- Any data backfill from old tables into the new model.
- Create/edit forms for the new entities — the new pages are **read-only
  shells** right now. (Creating a job/project/client-profile from the UI is a
  natural early Phase 2 task and is required to fully hit the Phase 1 success
  criteria interactively.)

---

## 4. Existing functionality preserved

No existing table, column, route, or component was modified or removed (only
`Sidebar.tsx` was edited, additively, and `database.types.ts` extended). The
real estate pipeline (clients → listings → orders → photos → ai_jobs →
delivery_links, scheduling, products, client portal, galleries) is fully
intact and reachable under the "Real Estate" sidebar group.

---

## 5. Recommended next PR — Real Estate Photo Rescue

The schema is already in place (`assets`, `asset_groups`, `asset_group_items`,
`qc_reports`, `worker_tasks`, `tool_runs`). Build the pipeline:

```text
Ingest → metadata scan → file completeness check → bracket grouping
→ scene classification → preview/contact sheet → processing route
→ edit → QC → export → delivery
```

Bracket detection signals: capture timestamp, camera model, lens, focal
length, exposure value, shutter, aperture, ISO, visual similarity, file
sequence, time gap, GPS, folder context. Each `asset_groups` row already has
`confidence_score`, `review_required`, `reviewed_by`, `reviewed_at`.

Manual correction UI: merge groups, split groups, mark base exposure,
mark flash/ambient, mark drone, mark reject, mark manual review
(use `asset_group_items.role`).

QC (`qc_reports.qc_type = 'real_estate_photo_qc'`, store per-check results in
`checks jsonb`): neutral whites, vertical lines, believable windows, natural
skies, no fake HDR, no halos, no color cast, correct interior temperature,
no blur, no duplicates, correct export sizes.

There is existing related code to reuse/build on:
`lib/photos/bracket-grouping.ts`, `lib/ai/bracket-detect.ts`,
`lib/ai/vision-analyze.ts`, `lib/ai/oceano-enhance/*`.

---

## 6. Conventions cheat-sheet for the next agent

- **Server components** fetch via `createClient()` from `@/lib/supabase/server`
  (RLS-aware). Use `createAdminClient()` only for server-only/system tasks that
  must bypass RLS.
- **Styling**: Tailwind with custom `ocean-*` palette and component classes in
  `app/globals.css` (`.card`, `.pill`, `.btn-primary`, `.input`, `.label`,
  `.table-head`). Icons from `lucide-react`.
- **Migrations**: next file is `0025_*.sql`. Keep them additive and idempotent
  (`create table if not exists`, `add column if not exists`, `on conflict do
  nothing`). Reuse `set_updated_at()` for new `updated_at` columns.
- **Don't** commit `tsconfig.tsbuildinfo` or build artifacts.
- **Branch**: Phase 1 lives on `production-os-foundation` (not yet a PR).

---

## 7. Phase 1 success criteria — status

The system is **structurally ready** for all of these (tables, RLS, seeds,
indexes, shell UI exist). Interactive create/edit forms are the remaining glue
to exercise them end-to-end via the UI (early Phase 2):

create client profile (Client DNA) · create project · create job · assign job
type · attach workflow template · create workflow runs/steps · register assets
· group assets · track storage locations · track Make.com scenarios · track
AI/tool runs · track review links · track QC reports · track delivery versions
· show job in Command Center · show job activity timeline · preserve existing
real estate functionality.

---

## 8. Product North Star (unchanged)

This is not just a workflow app — it is the operating system for the production
company: **Oceano Blue Production Intelligence System**. Over time it should
capture client preferences, production standards, editing logic, AI outputs,
review history, automation history, editor/tool performance, QC issues,
delivery patterns, and approval behavior — making Oceano Blue faster, more
consistent, less memory-dependent, easier to scale, stronger at QC and
outsourcing, and more valuable with every job.
