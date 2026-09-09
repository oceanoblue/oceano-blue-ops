# Podcast thumbnail frame picker v2 — frames from the episode video

Date: 2026-09-09. Status: approved design. Supersedes the frame source of v1
(commit 5ecb8f9 / fix d551e55), keeps v1 as the fallback path.

## Problem

v1 picks the hosts/guest source frames for a Mind Your Health thumbnail from
YouTube's three auto-extracted frames (`maxres1/2/3.jpg` = 25/50/75 % of the
runtime). On Natalie Lucas's episode all three were guest-only shots, so the
hosts could only come from the standing `refs/hosts.jpg` identity photo. Three
frames are not enough to reliably catch a clean two-shot of the hosts in the
episode's own outfit.

## Goal

Give the picker ~12 frames sampled across the whole episode, taken from the
editor's delivered mp4 in Dropbox, so a hosts frame and a guest frame are found
in the large majority of episodes — with zero new manual steps for Gustavo,
and with every failure degrading to today's v1 behaviour (never to a bad
thumbnail).

Non-goals: no change to the thumbnail composition prompt, no change to the
Make scenario's structure beyond a timeout, no pre-extraction at intake, no
new job types.

## Architecture

```
Make (Thumbnail Generator, module 13)
  └─ POST /api/automations/podcast/pick-frames {show_slug, youtube_id}
       ├─ resolve episode → Dropbox mp4 path        (Supabase, admin client)
       ├─ Dropbox get_temporary_link(mp4)           (lib/integrations/dropbox)
       ├─ worker-edit POST /frames {url, count:12}  (Fly.io, ffmpeg)  ──► 12 JPEGs
       ├─ vision picker over the 12 frames          (lib/podcasts/frame-picker)
       ├─ write hosts.jpg / guest.jpg / candidates.jpg to Dropbox
       │    Podcasts/<show>/Thumbnails/frames/<episode basename>/
       └─ respond with Dropbox temporary links for Make to download
```

If any step before the picker fails, the frame source becomes YouTube's three
frames exactly as in v1. Typical wall time 40–60 s; hard budget 300 s.

## Components

### 1. worker-edit `POST /frames` (Python / FastAPI, Fly app `oceano-edit-engine`)

- `Dockerfile`: `apt-get install -y --no-install-recommends ffmpeg` alongside
  `libglib2.0-0`; add `frames.py` to the `COPY` line.
- New module `worker-edit/frames.py`, mounted from `server.py`.
- Auth: header `x-edit-secret` must equal `EDIT_WORKER_SECRET` (401 otherwise),
  same as `/edit`.
- Request (JSON): `{ "url": string, "count": int = 12, "long_edge": int = 1280 }`.
  `count` clamped to 1..24, `long_edge` to 320..1920. `url` must be http(s).
- Behaviour:
  1. `ffprobe -v error -show_entries format=duration -of json <url>` → duration
     (seconds). Timeout 30 s. Failure → 502 `{"detail":"probe_failed: ..."}`.
  2. Timestamps: `count` values evenly spaced across `[5 %, 95 %]` of the
     duration (inclusive). Pure function `frame_timestamps(duration, count)`.
  3. For each timestamp run
     `ffmpeg -v error -ss <t> -i <url> -frames:v 1 -vf scale=<long_edge>:-2 -f image2 -c:v mjpeg -q:v 3 pipe:1`
     (input-side seek: ffmpeg range-reads only the moov atom plus the GOP it
     needs). At most 4 processes concurrently (`asyncio.Semaphore`), 45 s per
     frame, 150 s overall.
  4. A frame that fails or times out is dropped; the response contains the
     frames that succeeded. Zero frames → 502 `{"detail":"no_frames"}`.
- Response (JSON): `{ "duration": float, "frames": [ { "index": 1-based int,
  "t": float, "jpeg_b64": string } ] }`. Frames are numbered by their position
  in the timestamp list (so index 1 is always the earliest), including when some
  were dropped.
- The subprocess runner is one injectable function (`run_ffmpeg(args, timeout)`)
  so the HTTP contract test can monkeypatch it.

### 2. App: `lib/ai/edit-engine.ts` — `extractFrames(url, opts)`

- `extractFrames(url: string, opts: { count?: number; longEdge?: number; timeoutMs?: number }): Promise<{ duration: number; frames: { index: number; t: number; bytes: Buffer }[] }>`.
- POSTs JSON to `${EDIT_ENGINE_URL}/frames` with `x-edit-secret`; uses
  `AbortSignal.timeout(timeoutMs ?? 170_000)` (the worker's own cap is 150 s).
- Throws `edit_engine_<status>: <body slice>` on non-2xx, like `runEditEngine`.
- Returns nothing special when unconfigured: callers check
  `editEngineConfigured()` first.

### 3. App: `lib/podcasts/episode-source.ts` — resolve the episode's video

- `resolveEpisodeSource(admin, youtubeId): Promise<{ episodeId, jobId, dropboxPath, basename } | null>`.
- Query: `external_links` where `link_type='youtube_video'` and
  `external_id=youtubeId` → `job_id`; `podcast_episodes` where `job_id` →
  `metadata.dropbox_path` and `metadata.filename` (fallback: `assets` row with
  `job_id`, `asset_type='source'`, `local_path`).
- `basename` = filename without extension, lower-cased — identical to the Make
  scenario's `ref_base` so folder names match what Gustavo already sees in
  emails. Pure helper `episodeBasename(filename)`.
- Returns `null` when any link in the chain is missing. Never throws.

### 4. App: `lib/integrations/dropbox.ts` — `uploadFile(path, bytes)`

- `uploadFile(path: string, bytes: Buffer, opts?: { mode?: 'overwrite' | 'add' }): Promise<'ok' | 'not_configured' | 'failed'>`.
- `POST https://content.dropboxapi.com/2/files/upload` with
  `Dropbox-API-Arg: {"path","mode":"overwrite","mute":true}`,
  `Content-Type: application/octet-stream`.
- Applies the same Dropbox-Business team-token retry as `dbxUserCall`
  (`Dropbox-API-Select-User`) — factor the retry into a helper that takes the
  request builder, or add a `dbxContentCall` sibling.
- Best-effort semantics: callers treat `'failed'` as non-fatal.

### 5. App: `lib/podcasts/contact-sheet.ts` — `buildContactSheet(frames)`

- Input: `{ index: number; bytes: Buffer }[]` (up to 24). Output: one JPEG.
- 4 columns, tiles 320 px wide (aspect preserved from the first frame, 16:9
  assumed → 320×180), 8 px gutter, each tile stamped with its index in the top
  left (white text on a dark plate, SVG overlay via sharp `composite`).
- Pure geometry helper `sheetLayout(count, cols=4, tileW=320, tileH=180, gap=8)`
  returns positions + canvas size — unit-tested.

### 6. App: `app/api/automations/podcast/pick-frames/route.ts` (v2 orchestration)

`export const maxDuration = 300`. Steps, in order:

1. Auth + body validation exactly as v1.
2. Hosts reference: `<show>/Thumbnails/refs/hosts.jpg` via temporary link, as v1.
3. `source = await resolveEpisodeSource(admin, youtube_id)`.
4. If `source && isDropboxConfigured() && editEngineConfigured()`:
   `link = getTemporaryLink(source.dropboxPath)` → `extractFrames(link, { count: 12 })`.
   On any throw, log `[pick-frames] video frames unavailable: <reason>` and
   continue with `frames = null`.
5. If video frames exist (≥ 1): `frameSource = 'video'`, candidates are the
   worker frames re-indexed 1..N in order. Else `frameSource = 'youtube'` and
   candidates are YouTube's maxres1/2/3 as v1.
6. Run `pickFramesWithVision(reference, candidates)` (unchanged function; its
   prompt already says "FRAME 1..N").
7. If `frameSource === 'video'`: write to Dropbox under
   `${showFolderPath(slug)}/Thumbnails/frames/${source.basename}/`:
   `candidates.jpg` (contact sheet, always), `hosts.jpg` (if picked),
   `guest.jpg` (if picked). Then `hosts_frame_url` / `guest_frame_url` =
   temporary links of the written files. If a write or link fails for a picked
   frame, that URL becomes `null` (Make falls back to `refs/hosts.jpg` /
   `maxres2.jpg`) and `notes` gets a suffix `"(upload failed: <reason>)"`.
   If `frameSource === 'youtube'`, URLs are the YouTube frame URLs as in v1.
8. Response — v1 shape plus two fields:
   ```json
   {
     "hosts_frame": 7, "guest_frame": 3, "guest_remote": false,
     "notes": "...", "hosts_frame_url": "...", "guest_frame_url": "...",
     "hosts_reference_used": true, "frames_considered": 12, "model": "gpt-5.4",
     "frame_source": "video" | "youtube",
     "frames_folder": "/Podcasts/mind-your-health/Thumbnails/frames/<basename>" | null
   }
   ```
   A picker miss still returns nulls with notes; never a 5xx for a miss.

### 7. Make scenario (5918919) — one edit

Module 13 `timeout` `"60"` → `"300"`. Nothing else changes: modules 6/7 still
GET `{{13.data.hosts_frame_url}}` / `{{13.data.guest_frame_url}}` with the same
fallbacks. Optional cosmetic: the success email (module 11) may add
`Frame source: {{13.data.frame_source}}` and a line naming `frames_folder`.
The blueprint contains no secrets (data store lookups), so it is safe to PATCH.

## Data flow of a frame, end to end

mp4 bytes stay in Dropbox → ffmpeg on Fly reads only the ranges it needs →
12 JPEGs (~100 KB each at 1280 px) travel Fly → Vercel as base64 JSON
(~1.6 MB) → shrunk to 896 px for the vision call → the two picks + contact
sheet are written back to Dropbox → Make downloads the two picks from Dropbox
temporary links. Nothing is stored in Supabase.

## Error handling summary

| Failure | Result |
|---|---|
| Episode not found for youtube_id / no dropbox_path | YouTube 3-frame path (v1) |
| Dropbox temp link fails (file moved, scope) | YouTube path; reason logged |
| Edit engine unconfigured / cold-start timeout / 5xx | YouTube path; reason logged |
| Some ffmpeg frames fail | Picker runs on the frames that succeeded |
| Zero frames | YouTube path |
| Vision model fails on all models | nulls + "Picker unavailable." (v1) |
| Dropbox upload of picks fails | URL null → Make's existing fallbacks; note suffixed |
| Total time > 300 s | Vercel kills the function → Make module 13 errors → onerror Resume "" → full v1 fallback in Make |

## Testing

worker-edit (`pytest`, runs in CI's `edit-engine` job):
- `test_frames.py::test_frame_timestamps_spacing` — pure: count, first ≈ 5 %,
  last ≈ 95 %, strictly increasing, count=1 → midpoint.
- `test_frames.py::test_frames_contract` — `TestClient`, monkeypatched
  `run_ffmpeg` returning a synthetic JPEG for probe/extract; asserts auth 401,
  JSON shape, 1-based indices, partial-failure drop, zero-frames → 502.
- `test_frames.py::test_frames_real_ffmpeg` — generates a 4 s `testsrc` mp4
  with ffmpeg into a temp dir and calls the extraction function directly with
  the local path (ffmpeg accepts paths; the http-only URL guard lives in the
  endpoint, not the extractor), asserting 3 decodable JPEGs with strictly
  increasing timestamps. `pytest.mark.skipif` when `shutil.which("ffmpeg")`
  is None, so CI (no ffmpeg) still passes.

app (`vitest`):
- `lib/podcasts/episode-source.test.ts` — `episodeBasename()` cases.
- `lib/podcasts/contact-sheet.test.ts` — `sheetLayout()` geometry; one
  end-to-end sharp render of 3 tiny frames asserting output dimensions.
- `lib/podcasts/frame-picker.test.ts` — unchanged, still passes.
- `app/api/automations/podcast/pick-frames` — response-merge helper extracted as
  a pure function (`mergePickResponse`) and unit-tested for the video/youtube
  branches and the upload-failed nulling.

## Deployment order

1. worker-edit: `cd worker-edit && fly auth login && fly deploy` (Gustavo logs
   in; Claude runs deploy once logged in). Verify `GET /health` and a manual
   `/frames` call against a short public mp4.
2. App: commit + push to `main` (Vercel auto-deploy), confirm READY.
3. Make: PATCH module 13 timeout to 300.
4. Verify: retarget the generator at Natalie (7EoLLmu0b7s), run, restore the
   normal formula, check the email reports `frame_source: video` and view
   `Thumbnails/frames/<basename>/candidates.jpg` + the new thumbnail.

## Open constraints carried from v1

- Never read Make execution detail logs for this scenario (module 13's request
  carries the automation secret).
- The July episodes' `dropbox_path` still points at the old `RENDERS` folder;
  they fall back to the YouTube path until moved. New episodes ingest with the
  `/Podcasts/mind-your-health/02-Edited` path.
