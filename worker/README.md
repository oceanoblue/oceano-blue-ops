# Oceano ARW Conversion Worker

A small Node service that decodes camera RAW files (ARW / CR2 / CR3 / NEF / DNG / RAF / RW2 / ORF) to high-quality JPEG using LibRaw, so the main Oceano Blue Ops platform can run AI enhancement on photos shot in RAW without forcing the photographer to export through Lightroom first.

## Architecture

```
Photographer uploads house.ARW (60 MB)
         │
         ▼  TUS resumable upload
   Supabase Storage (raw-photos)
         │
         ▼  photos row inserted
       photos table
         │
         ▼  user clicks "Convert RAW" in PhotoManager
   /api/raw-convert     (Next.js route, auth check)
         │
         ▼  POST /convert {photo_id}, x-worker-secret
   Worker on Fly.io
         │
         ├─ downloads ARW from Supabase
         ├─ runs dcraw_emu → 16-bit linear TIFF
         ├─ Sharp → sRGB JPEG, 3000px long edge, q92
         ├─ uploads JPEG back to raw-photos bucket
         └─ inserts sibling photos row (kind=raw, parent_photo_id=ARW)
         │
         ▼  UI refreshes, JPEG appears next to the ARW
   AI pipeline can now process the JPEG normally
```

## Local dev

```bash
cd worker
npm install
SUPABASE_URL=...  SUPABASE_SERVICE_KEY=...  WORKER_SECRET=test  npm run dev
```

Test against a fake conversion:
```bash
curl -X POST http://localhost:8080/convert \
  -H 'content-type: application/json' \
  -H 'x-worker-secret: test' \
  -d '{"photo_id":"<uuid-of-an-arw-row>"}'
```

## Deploy to Fly.io

One-time setup (you only need a Fly account — free tier covers this):

```bash
brew install flyctl                    # macOS
fly auth signup                        # or `fly auth login`
cd worker
fly launch --copy-config --no-deploy   # accept defaults
```

Set secrets:

```bash
fly secrets set \
  SUPABASE_URL='https://<project-ref>.supabase.co' \
  SUPABASE_SERVICE_KEY='eyJhbGc...'      \
  WORKER_SECRET=$(openssl rand -hex 32)
```

Copy that `WORKER_SECRET` value — you need the same string in Vercel as `ARW_WORKER_SECRET` so the main app can talk to the worker.

Deploy:

```bash
fly deploy
```

Once it boots you'll get a URL like `https://oceano-arw-worker.fly.dev`. Set that in Vercel as `ARW_WORKER_URL`.

## Vercel env vars (main app)

| Variable | Value |
|---|---|
| `ARW_WORKER_URL` | `https://oceano-arw-worker.fly.dev` |
| `ARW_WORKER_SECRET` | (same value you set as `WORKER_SECRET` on Fly) |

## Cost estimate

Fly.io `shared-cpu-1x` with `auto_stop_machines = "suspend"` and `min_machines_running = 0` means the VM **sleeps when idle and wakes on the next request**. Cold start is 2-3 seconds. Conversion of a typical ARW (50-80 MB) takes 4-8 seconds on this size machine.

- Idle: $0
- ~100 conversions/day: $0-3/month (still within free allowance for most accounts)
- ~1000 conversions/day: $5-10/month

Scale up to `shared-cpu-2x` (1 GB RAM) if you need to handle parallel batches.
