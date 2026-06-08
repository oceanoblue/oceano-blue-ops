# Oceano Blue Production OS
## Real Estate Photo Rescue — Feature Handoff

Prepared for: Gustavo Rattia / Oceano Blue Media
Repo: `oceanoblue/oceano-blue-ops`
Branch: `production-os-foundation` (pushed to `origin`, no PR opened yet)
Feature commit: `d6bf53d` (builds on Phase 1: `a083e95`)
Stack: Vercel, Supabase (Postgres), Next.js 14 (App Router), TypeScript, Tailwind
Date: 2026-06-07

> This hands off the **completed Real Estate Photo Rescue** feature to the next
> agent/session. It explains what exists, how it works, the exact API
> contracts, what was deliberately left out, and how to extend it. Read this
> before writing code so you don't duplicate or break what's here. It assumes
> the Phase 1 foundation (see `docs/PRODUCTION_OS_PHASE1_HANDOFF.md`).

---

## 0. TL;DR

A real estate photo **ingest → bracket review → delivery QC** workflow built
entirely on the Phase 1 schema (no parallel system). The browser reads a shoot
folder, extracts EXIF locally, and posts only metadata; the server registers
`assets`, detects HDR bracket groups by **reusing the two existing detectors**,
scores each group's confidence, flags uncertain ones for review, exposes a
manual correction UI (merge/split/role/reject/mark-reviewed), and generates a
`real_estate_photo_qc` report. Heavy media never leaves the local machine.

Validated: typecheck 0 new errors (142 baseline), lint clean, build passes
(6 new routes), and every route's DB write verified against a real Postgres 16
with the Phase 1 schema applied.

---

## 1. What this feature does (the 8 goals → where)

| # | Goal | Implementation |
|---|------|----------------|
| 1 | Scan a folder / imported set | `components/photos/rescue/IngestPanel.tsx` — browser folder/file picker |
| 2 | Register all files as assets | `POST /api/re-photo/ingest` → `assets` rows |
| 3 | Extract metadata | EXIF read **client-side** via `exifr`, stored in `assets.exif` + `captured_at` |
| 4 | Detect bracket groups | `lib/photos/asset-bracket-detect.ts` (reuses existing detectors) |
| 5 | Assign confidence scores | Reconciler → `asset_groups.confidence_score` (0.60–0.97) |
| 6 | Flag uncertain groups | `review_required = confidence < 0.85` |
| 7 | Manual correction UI | `components/photos/rescue/GroupReviewList.tsx` → `POST /api/re-photo/groups` |
| 8 | QC report for delivery | `POST /api/re-photo/qc` → `qc_reports` (qc_type `real_estate_photo_qc`) |

---

## 2. Files added / changed

### Added
```
lib/photos/asset-bracket-detect.ts            # confidence reconciler (reuses detectors)
app/api/re-photo/ingest/route.ts              # register assets + detect + persist groups
app/api/re-photo/groups/route.ts              # manual correction actions
app/api/re-photo/qc/route.ts                  # delivery QC report
app/api/re-photo/jobs/route.ts                # minimal RE-photo job creator
components/photos/rescue/IngestPanel.tsx      # folder import + client EXIF + POST
components/photos/rescue/GroupReviewList.tsx  # bracket review + correction UI
components/photos/rescue/QcPanel.tsx          # generate/show QC report
components/photos/rescue/NewReJobButton.tsx   # create job button (index page)
app/dashboard/photo-rescue/page.tsx           # RE-photo job list + create
app/dashboard/jobs/[id]/photo-rescue/page.tsx # the rescue workspace
docs/REAL_ESTATE_PHOTO_RESCUE_HANDOFF.md      # this doc
```

### Changed (additive only)
```
components/layout/Sidebar.tsx     # added "Photo Rescue" link under Real Estate
app/dashboard/jobs/[id]/page.tsx  # rescue link on Assets tab; select now includes job_types.key
```

No existing tables, migrations, or real estate pages were modified.

---

## 3. Schema used (all Phase 1 — nothing new)

| Table | Use |
|-------|-----|
| `assets` | one row per file; `media_type='photo'`, `asset_type='source'`; `status` flows `indexed → grouped`/`rejected`; `exif` + `metadata.is_drone` |
| `asset_groups` | one row per bracket; `group_type='real_estate_bracket'`; `confidence_score`, `review_required`, `reviewed_by/at`; `metadata={method,reason,detected_size}` |
| `asset_group_items` | membership; `role` ∈ base_exposure/flash/ambient/drone/manual_review/reject; `sort_order` |
| `worker_tasks` | `task_type='scan_folder'`, completed, with file/result counts |
| `tool_runs` | `tool_type='local_worker'`, `provider='bracket_detection'`, completed |
| `qc_reports` | `qc_type='real_estate_photo_qc'`; `checks` jsonb; `quality_score` (0–100 automated) |
| `production_events` | `folder_scanned`, `assets_indexed`, `brackets_detected`, `brackets_merged`, `bracket_split`, `bracket_created`, `bracket_reviewed`, `qc_report_created`, `job_created` |

`assets.status` convention in this feature: `indexed` (single), `grouped` (in a
bracket), `rejected` (excluded from delivery). Group items keep their row even
when an asset is rejected.

---

## 4. Detection & confidence model (the core fix)

`lib/photos/asset-bracket-detect.ts` **reuses** (does not reimplement):

- `groupPhotosIntoBrackets` (`lib/photos/bracket-grouping.ts`) — filename
  sequence runs of 3/5/7. Fast, ~95% correct for photographer uploads.
- `detectBrackets` (`lib/ai/bracket-detect.ts`) — EXIF signature: capture
  timestamp window + same camera/lens/focal length + distinct exposure bias.

Both read only `id`, `filename`, `exif`, `created_at`, `byte_size` — all present
on `assets` — so asset rows are passed through with a structural cast. Results
are reconciled into confidence-scored groups:

```
filename run CONFIRMED by EXIF brackets    → 0.97   review_required = false
filename run, no EXIF available to confirm → 0.82   review_required = false
filename run, EXIF present but disagrees    → 0.60   review_required = true
EXIF-only group (filenames not sequential) → 0.65   review_required = true
REVIEW_THRESHOLD = 0.85  (anything below is flagged)
```

Ordering: darkest → brightest by exposure bias when known. **Base exposure** is
auto-tagged on the frame with bias closest to 0 (else the middle frame).
Drone heuristic (`looksLikeDrone`) tags `assets.metadata.is_drone` from
EXIF make/model (DJI/Mavic/Phantom/Air/Inspire/FC…); the user can also set the
`drone` role manually.

> EXIF round-trips through JSON: client sends `DateTimeOriginal` as a `Date`
> (→ ISO string) and `ExposureBiasValue` as a number; `bracket-detect.ts`
> already handles both forms, so detection works on the stored values.

---

## 5. API contracts

All routes: `POST`, auth via `createClient().auth.getUser()`, writes via
`createAdminClient()` (cast `as any` in these glue routes — see §8), zod-validated
bodies. Mirrors `app/api/photos/decide`.

### `POST /api/re-photo/ingest`
```jsonc
{ "job_id": "uuid",
  "files": [ { "filename": "OBM001.ARW", "local_path": "shoot/OBM001.ARW",
               "byte_size": 1234, "mime_type": "image/x-sony-arw",
               "captured_at": "2026-06-07T12:00:00Z",
               "exif": { "ExposureBiasValue": -2, "Model": "ILCE-7M4", ... } } ] }
```
→ registers assets, detects+persists groups, logs worker_task/tool_run/events,
advances job status. Returns `{ ok, assets, groups, needs_review, singles }`.
Posted in chunks of 150 by the client.

### `POST /api/re-photo/groups` (discriminated by `action`)
```
{ action: "merge",        job_id, group_ids: [uuid, uuid, ...] }
{ action: "split",        group_id }
{ action: "create_group", job_id, asset_ids: [uuid, uuid, ...] }
{ action: "set_role",     group_id, asset_id, role }   // role incl. "reject"
{ action: "mark_reviewed", group_id }
{ action: "reject_asset", asset_id }
```
Any manual action marks the resulting group reviewed (review_required=false).
`set_role`/`reject_asset` with reject sets `assets.status='rejected'`.

### `POST /api/re-photo/qc`  `{ job_id }`
Automated checks: `all_files_indexed`, `no_duplicates` (filename),
`brackets_reviewed` (no group needs review), `metadata_present` (≥80% EXIF
coverage). Visual checks (neutral whites, vertical lines, believable windows,
natural skies, no fake HDR, no halos, no color cast, interior temperature,
no blur, correct export sizes) are recorded `pending` for human sign-off.
`quality_score` = automated passed / automated total × 100.

### `POST /api/re-photo/jobs`  `{ title, client_id? }`
Minimal RE-photo job creator (job_type `real_estate_photo`). Returns
`{ ok, job_id }`. Stopgap until generic job/project/client forms exist.

---

## 6. UI

- **`/dashboard/photo-rescue`** — lists `real_estate_photo` jobs; "New RE photo
  job" button (prompts for title → creates job → routes to workspace).
- **`/dashboard/jobs/[id]/photo-rescue`** — the workspace:
  - `IngestPanel`: "Select folder" / "Select files" → reads EXIF locally →
    posts metadata in chunks → `router.refresh()`.
  - `GroupReviewList`: groups sorted review-first, confidence badges
    (green ≥85 / amber ≥60 / rose <60 / slate "manual"), per-frame role select +
    EV display, merge (multi-select) / split / mark-reviewed; a Singles section
    with multi-select "Group selected".
  - `QcPanel`: generate / re-run QC; renders the checklist with statuses.
- Discoverability: Sidebar "Photo Rescue" (Real Estate group) + a link on the
  Job Detail **Assets** tab when the job is `real_estate_photo`.

---

## 7. What was intentionally NOT built (per scope)

- No photo editing / enhancement (Lightroom/Imagen/Evoto/Fotello triggers).
- No DaVinci automation.
- No full UI redesign.
- No thumbnails/proxies yet: originals stay local, so review shows filenames +
  EV + size, not images. (See §9 for how to add them.)
- No scene classification / contact sheet yet (next candidates).
- No automatic re-detection across multiple ingest batches — detection runs per
  ingested batch. Re-importing more files adds groups; it doesn't re-evaluate
  earlier ones.

---

## 8. Important implementation notes / gotchas

- **Admin client is cast `as any`** in the four `app/api/re-photo/*` routes.
  The hand-written `Database` type doesn't satisfy supabase-js's write generics
  (a pre-existing repo limitation — see `lib/ai/runner.ts`, `next.config.js`).
  The cast keeps these glue routes typecheck-clean. Trade-off: no compile-time
  column checking in those files — **column names were validated by executing
  every insert against a real Postgres 16 instance**. If you change a column,
  re-run that check.
- **Heavy media stays local by design.** Only metadata is stored. Don't add
  full-file uploads to Supabase for RE photos — it contradicts the architecture.
- EXIF for RAW files may be unreadable in-browser; filename-sequence detection
  still covers those.
- `confidence_score` is Postgres `numeric` → may come back as a string from
  PostgREST; the workspace coerces with `Number()`. Keep that when reading it.
- Reusing the detectors relies on assets being structurally compatible with the
  `Photo` type (id/filename/exif/created_at/byte_size). Keep those fields
  populated at ingest.

---

## 9. How to extend (suggested next steps — pick with the owner)

1. **Thumbnails / contact sheet.** Add a `worker_tasks` `generate_thumbnails`
   handler (local worker) or a server route using `sharp` to write
   `assets.thumbnail_url`; render thumbnails in `GroupReviewList`/`BracketCard`.
   The existing `app/api/photos/raw-preview` + worker show the RAW-preview
   pattern to follow.
2. **Scene classification.** Reuse `lib/ai/vision-analyze.ts` (`analyzePhoto`)
   to tag interior/exterior/twilight on the base frame; store on
   `assets.metadata.scene`; surface in review + QC.
3. **Processing route → edit.** Wire approved brackets into `tool_runs`
   (imagen/evoto/fotello) and `edit_recipes`; gate paid tools behind
   `approval_policies`/`approvals`.
4. **Delivery.** On QC pass, create a `delivery_versions` row (photo_gallery)
   and a `review_sessions`/`external_links` (Pixieset) record.
5. **Local worker runtime.** Implement `worker_register`/`worker_heartbeat` and
   a real `scan_folder` so a NAS/desktop can ingest without the browser.
6. **Backfill bridge.** Optionally map legacy `photos`→`assets` using the
   Phase 1 bridge columns once stable.

---

## 10. Conventions cheat-sheet (unchanged from Phase 1)

- Server components fetch via `createClient()` (`@/lib/supabase/server`);
  system writes via `createAdminClient()` after an auth check.
- Tailwind component classes: `.card`, `.pill`, `.btn-primary/secondary`,
  `.input`, `.table-head`. Icons from `lucide-react`.
- Migrations are additive + idempotent; next file is `0025_*.sql` (none added by
  this feature). Don't commit `tsconfig.tsbuildinfo` (build mutates it;
  `git checkout -- tsconfig.tsbuildinfo`).
- Branch `production-os-foundation`; no PR opened yet.

---

## 11. Validation performed

- `npm run typecheck` — 0 errors in feature files (142 pre-existing baseline).
- `next lint` (temp `next/core-web-vitals` config) — clean on all feature files.
- `npm run build` — passes; emits `/api/re-photo/{ingest,groups,qc,jobs}`,
  `/dashboard/photo-rescue`, `/dashboard/jobs/[id]/photo-rescue`.
- DB: replayed every route's inserts/updates against a real Postgres 16 with the
  Phase 1 schema — all columns/constraints correct, exit 0.
- Not done: live Supabase run (no creds here) and an automated unit test of the
  reconciler (it composes two production-tested detectors with simple set
  logic). Adding a test is a reasonable follow-up.
