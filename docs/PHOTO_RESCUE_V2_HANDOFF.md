# Oceano Blue Production OS
## Photo Rescue v2 (Visual Review) — Feature & Status Handoff

Prepared for: Gustavo Rattia / Oceano Blue Media
Repo: `oceanoblue/oceano-blue-ops`
Branch: `photo-rescue-v2-visual-review`
PR: **#4** (stacked on **#3** `production-os-foundation`) — base = `production-os-foundation`
Builds on: Phase 1 foundation (#3) + Real Estate Photo Rescue v1 (#3)
Date: 2026-06-07

> Hands off the **completed Photo Rescue v2 (visual review)** work and the
> current PR/monitoring state to the next agent/session. Read this plus the two
> earlier docs (`docs/PRODUCTION_OS_PHASE1_HANDOFF.md`,
> `docs/REAL_ESTATE_PHOTO_RESCUE_HANDOFF.md`) before touching the code.

---

## 0. TL;DR

Makes the Real Estate Photo Rescue workflow usable by **looking at the images**.
Adds locally-generated thumbnails (originals never uploaded), a contact-sheet
view, a scene-classification foundation (interior/exterior/drone/twilight/
amenity/detail/unknown), and the first unit tests in the repo. No new product
scope beyond visual review. CI is green; PR #4 is `mergeable_state: clean`.

---

## 1. PR / branch topology (important)

```
main
 └── production-os-foundation        ← PR #3 (Phase 1 + Rescue v1), OPEN
      └── photo-rescue-v2-visual-review  ← PR #4 (this work), OPEN, base = #3
```

- **PR #4 is stacked on #3.** Its diff shows only the v2 changes *as long as the
  base stays `production-os-foundation`*.
- **Merge order:** merge #3 first, then #4. After #3 merges, GitHub auto-retargets
  #4 to `main` (or retarget/rebase manually). Re-verify mergeability then —
  merge-conflict transitions are **not** delivered by webhooks.
- Current state (last checked): **CI green**, **0 review threads**,
  `mergeable_state: clean`.

---

## 2. What v2 adds

### Thumbnails — visual previews, originals stay local
- `lib/photos/client-thumbnail.ts` — browser builds a small JPEG preview:
  canvas downscale for JPEG/PNG/WebP; `exifr.thumbnail()` embedded preview for
  RAW; returns null on failure (UI falls back to filename + EV).
- `components/photos/rescue/IngestPanel.tsx` — after ingest, generates a preview
  per file and uploads **only** the previews (base64, batched ≤10) to the server.
- `app/api/re-photo/thumbnails/route.ts` — uploads previews to a new **private
  `thumbnails` bucket** (migration `0025`) and writes the storage path to
  `assets.thumbnail_url`; logs a `thumbnail_generate` tool_run + event.
- `lib/photos/thumbnails-server.ts` — `signThumbnails()` batch-signs paths
  (private bucket → signed URLs, mirroring `raw-photos`).
- Thumbnails render in `GroupReviewList` (group rows + singles grid).

### Contact sheet
- `app/dashboard/jobs/[id]/photo-rescue/contact-sheet/page.tsx` — whole-job grid
  of thumbnails with scene tags and rejected markers. Linked from the rescue
  workspace header.

### Scene classification foundation
- Categories: `interior | exterior | drone | twilight | amenity | detail |
  unknown`. Stored in `assets.metadata.scene` with `scene_source` ∈
  `heuristic | manual | ai`.
- `lib/photos/scene.ts` — types, `heuristicScene()` (drone-from-EXIF at ingest),
  `sceneBadgeClass()`.
- `lib/photos/scene-classify.ts` — optional `gpt-4o-mini` classifier over the
  **thumbnail** (reuses the `lib/ai/vision-analyze.ts` pattern). Returns null
  with no `OPENAI_API_KEY` → degrades to heuristic + manual.
- `app/api/re-photo/scene/route.ts` — manual override (merges into metadata).
- `app/api/re-photo/classify/route.ts` — AI pass over unlabeled assets that have
  thumbnails (bounded to 40/call). No-ops without an API key.
- UI: per-asset scene `<select>` + scene badges; "Auto-classify scenes" button
  (`components/photos/rescue/ClassifyButton.tsx`).

### Tests (first in the repo)
- `vitest` added (`devDependencies`), `npm test` script, `vitest.config.ts`
  (with the `@` path alias).
- `lib/photos/asset-bracket-detect.test.ts` — 5 tests: filename+EXIF confidence,
  filename-only, EXIF-only recovery, singles, 5-shot brackets.
- **Behavior change the tests forced:** `REVIEW_THRESHOLD` 0.85 → **0.80** so
  filename-only groups (score 0.82) are not falsely flagged for review. New
  mapping: no-review ≥ 0.82; review ≤ 0.65. This changes the `review_required`
  value computed at ingest going forward.

---

## 3. Files in this PR

### Added
```
supabase/migrations/0025_thumbnails_bucket.sql
lib/photos/client-thumbnail.ts
lib/photos/thumbnails-server.ts
lib/photos/scene.ts
lib/photos/scene-classify.ts
lib/photos/asset-bracket-detect.test.ts
app/api/re-photo/thumbnails/route.ts
app/api/re-photo/scene/route.ts
app/api/re-photo/classify/route.ts
app/dashboard/jobs/[id]/photo-rescue/contact-sheet/page.tsx
components/photos/rescue/ClassifyButton.tsx
vitest.config.ts
```
### Changed (additive)
```
app/api/re-photo/ingest/route.ts            # heuristic scene; returns asset ids for thumbnailing
app/dashboard/jobs/[id]/photo-rescue/page.tsx # sign thumbs, pass thumb_url+scene; header links
components/photos/rescue/IngestPanel.tsx     # generate + upload thumbnails
components/photos/rescue/GroupReviewList.tsx # thumbnails, scene badges, scene selector
lib/photos/asset-bracket-detect.ts          # REVIEW_THRESHOLD 0.85 -> 0.80
package.json / package-lock.json            # vitest + test script
```

---

## 4. Data & storage notes

- **Migration `0025`** creates a **private** `thumbnails` bucket (5 MB limit,
  jpeg/png/webp) with team-only read/write/update/delete policies via
  `is_team_member()`. Idempotent. References the Supabase `storage` schema, so it
  only applies on Supabase (validated locally with a `storage` shim).
- `assets.thumbnail_url` holds the **storage path** (e.g. `{job_id}/{asset_id}.jpg`),
  not a URL. Render via `signThumbnails()`.
- `assets.metadata.scene` / `scene_source` / `scene_confidence` carry scene data.
  Updates read-merge metadata (jsonb) so other keys are preserved.
- Heavy media (RAW/full-res JPEG) is **never uploaded** — only ≤512px previews.

---

## 5. Validation performed

| Check | Result |
|-------|--------|
| `npm test` (vitest) | 5/5 pass |
| `npm run typecheck` | 0 new errors (142 pre-existing baseline) |
| `next lint` | clean on all new files |
| `npm run build` | passes; 7 `re-photo` routes + contact sheet |
| Migration `0025` | applies + idempotent on Postgres 16 (private bucket, 4 policies) |
| New writes | `thumbnail_url`, `metadata.scene` merge, tool_runs/events verified on Postgres |
| PR #4 CI | green (Vercel preview + production); `mergeable_state: clean` |

Not done: live Supabase apply (no creds here); real-RAW thumbnail spot-check;
live AI-classification accuracy pass (needs `OPENAI_API_KEY`).

---

## 6. Monitoring state (PR #4)

This session is **subscribed to PR #4** and will, within scope:
- fix only what's required if **CI fails**;
- address only **review comments** that are within photo-rescue-v2 scope
  (ambiguous/architectural → ask first);
- otherwise add no features.

Coverage caveats (so the next agent doesn't assume full automation):
- `send_later` is **not available** in this session, and GitHub can't be polled
  from a background shell (MCP-only access). So reaction is to **pushed webhook
  events** (CI failures, review comments/reviews).
- Webhooks do **not** deliver CI success, new pushes, or **merge-conflict
  transitions**. When **#3 merges**, re-check #4's mergeability and rebase/
  retarget as needed — that won't arrive as an event.

---

## 7. Known issues / risks before merge

- New dev dependency **vitest** (devDependencies only; not in runtime bundle).
- The four `api/re-photo` write routes keep the v1 `as any` admin-client cast
  (pre-existing hand-written-types limitation; column correctness verified on
  Postgres). Inherited 142-error `tsc` baseline is unchanged; build ignores TS/
  ESLint via `next.config.js`.
- AI scene classification is **foundation/optional** — verify accuracy before any
  downstream automation depends on it.
- RAW thumbnails depend on the camera-embedded JPEG preview; confirm quality on
  real ARW/CR3 files.
- `REVIEW_THRESHOLD` change (0.85 → 0.80) alters future `review_required` values.

---

## 8. Suggested next steps (after #3 + #4 merge — do NOT start during monitoring)

1. Thumbnails for **legacy** assets / a re-thumbnail action for assets ingested
   before v2 (or when a preview failed).
2. Bulk scene actions (apply scene to a whole group; filter contact sheet by
   scene).
3. Wire approved brackets → processing route (`tool_runs` + `edit_recipes`),
   gated by `approval_policies` — still no editing-tool automation until decided.
4. Delivery: on QC pass, create `delivery_versions` + Pixieset `external_links`.
5. Local worker runtime for server-side scan/thumbnail/proxy (replaces the
   browser folder import for NAS/desktop ingest).

---

## 9. Conventions (unchanged)

- Server components fetch via `createClient()`; system writes via
  `createAdminClient()` after an auth check. Tailwind component classes; lucide
  icons. Migrations additive + idempotent (next is `0026_*.sql`). Don't commit
  `tsconfig.tsbuildinfo`. Run `npm test` / `npm run typecheck` / `npm run build`
  before pushing.
