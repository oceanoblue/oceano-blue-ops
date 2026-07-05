# CLAUDE.md — Oceano Blue Ops

Ops platform for Oceano Blue (real-estate photo/video production): Next.js 14 App
Router + TypeScript + Tailwind on Vercel, Supabase (Postgres/Auth/Storage), and
four out-of-band workers. This file holds the stable facts every session needs;
session-specific state lives in `docs/HANDOFF-*.md` (write one with `/handoff`).

## Commands (the verify loop)

```bash
npm ci                 # node_modules is usually absent in fresh sandboxes
npm run typecheck      # tsc --noEmit — MUST pass; types fail the Vercel build
npm run test           # vitest; tests live at lib/**/*.test.ts
npm run build          # needs placeholder NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/APP_URL (copy ci.yml values)
npm run lint           # informational only — no eslint config exists; do not try to "fix" lint gating

cd worker-edit && pip install -r requirements.txt pytest && pytest -q   # required, runs in CI
cd worker-resolve && python3 test_cutplan.py                            # plain python, NOT pytest, NOT in CI
cd worker-local && npm run check                                        # syntax check only
```

Old handoff docs mention a "142-error tsc baseline" — **stale**. Strict typing was
restored in PR #63; tsc must be clean.

## System map — one app, four workers

| Dir | Runtime | Runs on | Purpose | Auth (worker ↔ app) | Vercel-side env |
|---|---|---|---|---|---|
| `worker/` | Node/Express | Fly app `oceano-arw-worker` | RAW (ARW/CR2/NEF) → JPEG via LibRaw + Sharp | `x-worker-secret` = `WORKER_SECRET` (Fly) | `ARW_WORKER_URL`, `ARW_WORKER_SECRET` |
| `worker-edit/` | Python/FastAPI/OpenCV | Fly app `oceano-edit-engine` | Deterministic photo pipeline: bracket fusion, grade, window pull, sky | `x-edit-secret` | `EDIT_ENGINE_URL`, `EDIT_WORKER_SECRET` |
| `worker-local/` | Node (no Docker) | Office Mac / NAS | Scans allowlisted folders, indexes assets, thumbnails; polls `worker_tasks` | scoped `obw_…` Bearer key (never service key) | — |
| `worker-resolve/` | Python daemon | Office Mac (DaVinci Resolve Studio) | Claims `edit_jobs`, plans cuts, drives Resolve renders | scoped `obw_…` Bearer key | — |

- App falls back to the in-process pipeline when `EDIT_ENGINE_URL` is unset — local dev works without workers.
- `workflows/` at repo root = **product workflow templates (JSON), not CI**. CI lives in `.github/workflows/`.
- Vercel cron `/api/cron/run-pending-jobs` fires **every minute** and drives the AI job queue; guarded by `CRON_SECRET`.
- `.env.example` is incomplete (~14 of ~44 vars the code reads). Trust the code; grep for `process.env.`.

## Deploy matrix — the #1 "my change didn't take effect" trap

| Target | How it deploys | Verify |
|---|---|---|
| `app/`, `lib/`, `components/` | Vercel, auto on merge to `main` — but Vercel **sometimes skips the prod build**; always confirm the deployment's commit SHA before concluding a fix "didn't work" | Vercel dashboard SHA = merge SHA |
| `worker-edit/` | **Manual**: `cd worker-edit && git pull && fly deploy` | `curl https://oceano-edit-engine.fly.dev/health` → `{"ok":true,…,"raw":true}`; stale/missing `"raw"` = old build |
| `worker/` | Manual `fly deploy` (app `oceano-arw-worker`) | worker health endpoint |
| `worker-local/`, `worker-resolve/` | `git pull` on the office Mac (owner) | — |

**Dockerfile trap**: `worker-edit/Dockerfile` COPYs files by name. Adding a new
Python module without adding it to the COPY line crash-loops Fly with
ModuleNotFoundError (this cost a day once). When you add a module, update the
Dockerfile and say so in the PR.

## Sandbox limits (remote Claude Code sessions)

- No prod secrets, no `.env`, Supabase CLI not linked. Supabase MCP tools DO work (`apply_migration`, `execute_sql`).
- Cannot reach `*.fly.dev` (network policy 403) and cannot `fly deploy` or `vercel deploy` — Fly deploys and real-render checks are owner-manual. End sessions with an explicit "owner must run" list.
- Cannot delete merged remote branches (remote rejects ref deletion).

## Supabase

- Project: **Oceano Blue Ops**, ref `hcxqqbnoextequclrvff`. There is an unrelated "Immersive Experience" project — never touch it.
- Migrations: `supabase/migrations/`, additive + idempotent. Next number = highest existing + 1 (check the directory; do not trust docs).
- Production migrations go ONLY via the manual `db-migrate.yml` action (dry-run default, typed project-ref confirmation) or Supabase MCP `apply_migration` after a dry-run in a rolled-back transaction. Run the security advisor after DDL. See `docs/DB_MIGRATIONS_RUNBOOK.md`.
- `SUPABASE_ACCESS_TOKEN` (CI) must be a personal access token starting `sbp_` — not an anon/service JWT.
- `lib/supabase/database.types.ts` is hand-maintained (CLI not linked); the admin client carries an `as any` cast. Update the types file with every migration.
- Debugging jobs: `select job_type,status,model,error_message,created_at from ai_jobs order by created_at desc limit 10;`

## Platform gotchas (each of these burned multiple PRs)

- **Middleware blocks cookie-less callers**: any route called server-to-server (workers, crons, Make.com) must be in `middleware.ts` `PUBLIC_PATHS` — those routes self-authenticate. This failure looks like 307→/login or a silent never-running queue. Happened twice.
- **Never put `export const maxDuration` in a route handler** — on Next 14.2 + Vercel it emptied the cookie store and produced unfixable 401s (see `docs/POSTMORTEM_CONVERT_401.md`). Function timeouts go in `vercel.json`.
- **Stale Vercel functions exist**: if a deployed fix visibly doesn't take, do a no-cache redeploy ("Use existing Build Cache" UNCHECKED) early; as a last resort re-home the route to a new path.
- **Vercel log search is unreliable** — "no logs found" is not evidence. Surface diagnostics in the HTTP response body while debugging, then remove them.
- **Fly memory is 2GB**: downscale brackets BEFORE fusion, never after. OOM can masquerade as a sharp "unsupported image format" error from a fallback path.
- **RAW bytes must never reach generative providers** (GPT Image/Gemini) — RAW routes only to the deterministic engine or the ARW worker.

## Photo-grade tuning rules (see `docs/HANDOFF-photo-quality.md`)

The grade was re-tuned ~20 times across three engine generations because changes
shipped without render verification. Standing rules:

1. **One grade change per PR**, and it is not "done" until the owner confirms a real render (the kitchen test photo). Never stack a v(N+1) tune on an unverified v(N).
2. Run `worker-edit` pytest before pushing — the math invariants (no-halo edge test, dim-room + bright-window end-to-end, over-range separation) catch regressions that prose review misses.
3. Target look: bright, airy, accurate — AutoHDR-style "flambient". "Not HDR-pushed" means no halos/over-contrast, NOT darker.

## Standing rules

- Branch → PR → squash-merge. Give branches meaningful names (43 PRs once shipped from one fallback-named branch and became untraceable).
- Podcasts run on the existing Make.com pipeline — **untouched on purpose**; do not reroute without asking.
- Never commit secrets, Make.com blueprints, or webhook URLs. Never put the model identifier in commits/PRs/code.
- Fixes must reproduce the failure first (test or measured evidence) — the OOM, loupe-click, and dedupe bugs were each "fixed" twice because the first fix was reasoned, not reproduced.
