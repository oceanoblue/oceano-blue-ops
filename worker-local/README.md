# Oceano Blue Local Worker

A small Node service that runs on a local machine or NAS, connects to Production
OS, and indexes local media into `assets` (plus generates lightweight
thumbnails). By default it is read-only on disk. If `WORKER_OUTPUT_ROOT` is set,
it can also create non-destructive processed photo derivatives in that output
folder. It never deletes, moves, or overwrites source files, and only reads
inside an explicit allowlist of folders.

## How it works

```
Production OS  ──queued worker_tasks──▶  this worker (polls)
     ▲                                        │
     └────── results (assets, thumbnails) ────┘
```

The worker authenticates with a per-worker **API key** (Bearer token) issued
when you register it in `/dashboard/workers`. The Supabase service key never
touches this machine — the worker only talks to the Production OS worker API,
which performs the database/storage writes server-side.

Capabilities: `scan_folder`, `generate_thumbnails`, and opt-in `process_photos`.

## Setup

1. In Production OS: **Workers → Register worker**, copy the `obw_…` key (shown
   once).
2. On the local machine (Node 18+):
   ```bash
   cd worker-local
   npm install
   POS_BASE_URL=https://<your-app-domain> \
   WORKER_API_KEY=obw_xxxxxxxx \
   WORKER_ROOTS=/Volumes/Media/Shoots,/Volumes/NAS/Podcasts \
   WORKER_OUTPUT_ROOT=/Volumes/Media/Oceano-Processed \
   npm start
   ```

### Environment variables
| Var | Required | Meaning |
|-----|----------|---------|
| `POS_BASE_URL` | yes | Production OS base URL |
| `WORKER_API_KEY` | yes | the `obw_…` key from registration |
| `WORKER_ROOTS` | yes | comma-separated allowlist of root dirs the worker may read |
| `WORKER_OUTPUT_ROOT` | no | enables `process_photos`; derivative JPEGs are written here |
| `WORKER_NAME` | no | display name (default: hostname) |
| `WORKER_STORAGE_KIND` | no | `local` \| `nas` \| `external_drive` (default `local`) |
| `POLL_INTERVAL_MS` | no | default `15000` |
| `CLAIM_MAX` | no | tasks per poll (default `2`) |

The worker refuses to start without `WORKER_ROOTS`. Any task referencing a path
outside the allowlist (or via symlink/`..`) is rejected without touching disk.

## Tasks

- **scan_folder** — payload `{ "root_path": "<dir inside an allowlisted root>" }`.
  Recursively lists media files (skips symlinks + hidden/system dirs, caps at
  5000 files), reads light EXIF for images, and reports them so the server can
  index `assets` (deduped by job + local path) under a `storage_locations` row.
- **generate_thumbnails** — payload `{ "items": [{ "asset_id", "local_path" }] }`
  (≤ 20 per task). Builds ~512px JPEG previews (camera-embedded preview for RAW)
  and posts them; the server stores them in the private `thumbnails` bucket.
- **process_photos** — payload `{ "profile", "items" }`. Reads reviewed Photo
  Rescue source files, writes derivative JPEGs to `WORKER_OUTPUT_ROOT`, then
  reports those paths so the server indexes them as processed `assets` and
  queues thumbnails.

## Safety guarantees
- Source-safe: only derivative writes under `WORKER_OUTPUT_ROOT`; no deletes,
  moves, overwrites, or source edits.
- Allowlist-enforced paths; symlinks are never followed.
- No DaVinci automation, no publishing, no destructive operations.
- Holds only its own scoped API key — never the Supabase service key.
