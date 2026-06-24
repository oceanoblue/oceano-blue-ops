# Oceano Edit Daemon (office Mac + DaVinci Resolve)

Fulfils **reel** and **long-form** video orders. It polls the Ops edit-job
queue, pulls the client footage, drives **DaVinci Resolve Studio** to cut + render
per the saved edit plan, uploads the render, and moves the order to the **review
gate** (a human approves before delivery). Podcasts are unaffected — they keep
running on the Make.com pipeline.

```
Ops app (Vercel)                         Office Mac (this daemon)
  edit_jobs queue  ── claim ──────────▶  poll loop
  /api/worker/edit/context ───────────▶  download footage (signed URLs)
                                         transcribe + plan cuts (cutplan.py)
                                         build timeline + render (Resolve)
  /api/worker/edit/upload-url ◀───────   request signed upload URL
  reel-renders bucket   ◀── PUT ──────   upload render
  /api/worker/edit/complete ◀─────────   mark done → order = "ready" (review)
```

## Why this runs on a Mac, not the cloud
DaVinci Resolve is a desktop app; its scripting API only works against a running
Resolve. So this daemon lives on the office Mac. It holds **only** a scoped
per-worker Bearer key — never a Supabase service-role key. All storage access is
via short-lived signed URLs the Ops app issues.

## One-time setup

1. **DaVinci Resolve Studio** installed. Enable scripting:
   *Resolve → Preferences → System → General → External scripting using = Local*.
2. **Python 3.10+** and deps:
   ```sh
   cd worker-resolve
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. **Register this Mac as a worker** (from any signed-in team browser, or curl
   with a team session) to get a key — request the `edit_video` capability:
   ```sh
   curl -X POST "$OPS_BASE_URL/api/worker/register" \
     -H "content-type: application/json" \
     --cookie "<your team session cookie>" \
     -d '{"name":"Office Mac Studio","capabilities":["edit_video"]}'
   ```
   Copy the returned `api_key` (shown **once**, starts with `obw_`).
4. **Environment:**
   ```sh
   export OPS_BASE_URL="https://<your-ops-app-domain>"
   export OCEANO_WORKER_KEY="obw_…"
   export WORK_DIR="$HOME/oceano-edits"
   ```

## Run

```sh
python3 daemon.py            # poll loop (leave running; or wrap in launchd)
python3 daemon.py --once     # single cycle
python3 daemon.py --plan <edit_job_id>   # print the cut plan only (no render)
DRY_RUN=1 python3 daemon.py --once       # claim+plan preview, no Resolve/upload
```

Keep it always-on with a `launchd` agent (plist) pointing at `daemon.py`.

## How a job flows
1. Team saves an **edit plan** on the order, clicks **Send to edit engine** → a
   row lands in `edit_jobs` (status `queued`).
2. Daemon **claims** it, pulls footage, and for each source runs Resolve's
   *Create Subtitles From Audio* to get word/phrase timing.
3. **`cutplan.py`** turns that timing into clean IN/OUT points — trimming only in
   the silence between sentences, never mid-word (handoff §5–6), head-trimming
   the interviewer's question for Q&A, and dropping flubbed takes.
4. Resolve builds the timeline, applies a consistent crop, and renders MP4/H.264.
5. The render is uploaded and the order flips to **`ready`** for review.

## Testing without Resolve
`cutplan.py` is pure and unit-tested:
```sh
python3 test_cutplan.py
```
`DRY_RUN=1` and `--plan` exercise the full server round-trip (claim/context) and
the planner without needing Resolve installed.

## Files
| file | role |
|------|------|
| `daemon.py` | poll loop / orchestration |
| `api.py` | Ops worker-API client (claim/context/upload/complete) |
| `cutplan.py` | **pure** silence-gap cut planner (tested) |
| `resolve_runner.py` | DaVinci Resolve driver — **validate on the Mac** |
| `config.py` | env config |
| `test_cutplan.py` | planner tests |

> `resolve_runner.py` implements the documented Resolve scripting calls but is
> the one module that cannot be exercised from CI — verify it against your
> Resolve version on first run (the API surface is stable across v18–v21).
