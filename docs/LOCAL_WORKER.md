# Local Worker — operator & developer guide

Connects Production OS to local/NAS media. A small Node client (`worker-local/`)
runs on a machine that can see your files, polls the POS worker API, and indexes
media into `assets` + generates thumbnails. By default it is read-only on disk.
When `WORKER_OUTPUT_ROOT` is set, it can also write non-destructive processed
photo derivatives there. It never deletes, moves, or overwrites source files,
and only reads inside an explicit allowlist.

## Architecture

```
/dashboard/workers ──register──▶ POS issues a one-time API key (obw_…)
worker-local (your Mac/NAS) ──Bearer key──▶ POS worker API
  loop: heartbeat → claim tasks → run → post results
POS applies side-effects server-side (assets, thumbnails bucket, groups, events)
```

- Auth: per-worker API key (Bearer). Only the SHA-256 hash is stored
  (`local_workers.api_key_hash`); the plaintext is shown once at registration.
- The Supabase **service-role key never leaves the server** — the worker holds
  only its own scoped key.
- Capabilities: `scan_folder`, `generate_thumbnails`, and opt-in
  `process_photos`.

## One-time setup (operator)

1. **Register:** `/dashboard/workers` → **Register worker** → copy the `obw_…`
   key (shown once).
2. **Get the code** on the worker machine (Node 18+):
   ```bash
   git clone https://github.com/oceanoblue/oceano-blue-ops.git
   cd oceano-blue-ops/worker-local
   npm install
   ```
   (If you already have the repo: `git pull origin main`; if it complains about
   divergence, `git fetch origin && git reset --hard origin/main`.)
3. **Run it** (set vars on separate lines — avoids shell-quoting issues):
   ```bash
   export POS_BASE_URL=https://your-dashboard-domain   # no trailing slash
   export WORKER_API_KEY=obw_your_key
   export WORKER_ROOTS=/Volumes/home/WORKFLOW          # comma-separated allowlist
   export WORKER_OUTPUT_ROOT=/Volumes/home/WORKFLOW/_oceano_processed
   npm start
   ```
   Leave this terminal running — it is the worker. To run other commands, open a
   new tab so you don't stop it. Within ~15s `/dashboard/workers` shows it
   **online**.

### Env vars
| Var | Required | Notes |
|-----|----------|-------|
| `POS_BASE_URL` | yes | dashboard domain, no trailing slash |
| `WORKER_API_KEY` | yes | the `obw_…` key from registration |
| `WORKER_ROOTS` | yes | comma-separated allowlist; worker refuses to start without it |
| `WORKER_OUTPUT_ROOT` | no | enables `process_photos`; derivative JPEGs are written here |
| `WORKER_NAME` | no | display name (default hostname) |
| `WORKER_STORAGE_KIND` | no | `local` \| `nas` \| `external_drive` (default `local`) |
| `POLL_INTERVAL_MS` | no | default 15000 |
| `CLAIM_MAX` | no | tasks per poll (default 2) |

## Running a scan

`/dashboard/workers` → **Queue a folder scan** → pick a job + a **full folder
path inside an allowlisted root** (e.g. `/Volumes/home/WORKFLOW/113 Hunley`).
The worker indexes media; for `real_estate_photo` jobs it also detects brackets,
and thumbnails are auto-generated. Results appear on the job's Photo Production page.

Buttons on the Photo Production page:
- **Re-detect brackets** — re-group currently-ungrouped photos.
- **Generate thumbnails** — backfill previews for indexed photos missing them.
- **Auto-classify scenes** — AI scene tags (needs `OPENAI_API_KEY`).
- **Queue processing** — sends reviewed brackets and active singles to a local
  worker with `process_photos`; outputs are indexed as processed assets.

## Troubleshooting (lessons learned)

| Symptom | Cause / fix |
|---------|-------------|
| Heartbeat `405` | The worker/automation API paths must be in `middleware.ts` `PUBLIC_PATHS` (they self-authenticate). Fixed in PR #10. If you see it again, confirm the deploy is current. |
| Worker shows **offline** | The `npm start` process isn't running (e.g. you Ctrl+C'd it to run curl). Restart it; use a separate tab for other commands. |
| `JWT could not be decoded` on the server side | `SUPABASE_ACCESS_TOKEN` (CI) must be a Supabase **personal access token** starting `sbp_`, not an anon/service JWT. |
| Scan `failed: … outside the worker allowlist` | The folder isn't inside `WORKER_ROOTS`. Use a path within an allowlisted root. |
| Scan `failed: … is not a directory` | The path doesn't exist / typo. `ls "<path>"` to verify. |
| Scan `completed, file_count: 0` | No supported media at that path (or it's empty). `find "<path>" -type f` to check; supported: jpg/png/tiff/heic/webp, raw arw/cr2/cr3/nef/dng/raf/rw2/orf, video mp4/mov/m4v/mkv/mxf/…, audio wav/mp3/m4a/… |
| 0 files on a NAS even though files exist | SMB/AFP report dirent types as UNKNOWN; the walker now `lstat`s each entry (PR #12). Update the worker: `git pull` + restart. |
| Thumbnails blank | Assets indexed before auto-thumbnailing, or RAW without an embedded preview. Use **Generate thumbnails**. Check the worker log `generate_thumbnails -> completed { thumbnails, failed }`. |
| Queue processing says nothing to process | Groups still need review, source assets have no `local_path`, assets are RAW files that need conversion/export first, or the same source set was already processed. |
| `process_photos` never runs | Restart the worker with `WORKER_OUTPUT_ROOT` set; the heartbeat advertises `process_photos` only when an output root is configured. |

## Safety guarantees
- Source-safe: scan/thumbnail tasks are read-only; processing writes only new
  derivative JPEGs under `WORKER_OUTPUT_ROOT`.
- Allowlist-enforced paths; symlinks are never followed.
- No DaVinci automation, no publishing, no destructive operations.
- Worker key is hashed + shown once; revoke by deleting the `local_workers` row
  and re-registering.

## Code map
- `worker-local/src/{index,api,config,scan,thumbnail,process,safety}.mjs` — the client.
- `app/api/worker/{register,heartbeat,tasks/claim,tasks/result,tasks/enqueue,tasks/enqueue-thumbnails}` — the API.
- `lib/worker/{auth,path-safety}.ts` — server auth + tested path helpers.
- `lib/photos/persist-bracket-groups.ts` — shared detect+persist.
