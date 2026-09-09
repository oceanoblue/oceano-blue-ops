# Podcast Frame Picker v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed the thumbnail frame picker ~12 frames sampled from the episode's Dropbox mp4 (via a new ffmpeg endpoint on worker-edit) instead of YouTube's three auto-frames, writing the picks + a contact sheet back to Dropbox, with every failure degrading to today's v1 behaviour.

**Architecture:** Make calls `POST /api/automations/podcast/pick-frames` as today. The route resolves the episode's Dropbox mp4 from the `youtube_id`, gets a Dropbox temporary link, asks worker-edit `POST /frames` (Python/FastAPI on Fly, ffmpeg input-side seeks over HTTP) for 12 JPEGs, runs the existing vision picker over them, uploads `hosts.jpg` / `guest.jpg` / `candidates.jpg` to `Podcasts/<show>/Thumbnails/frames/<basename>/`, and returns Dropbox temporary links. Spec: `docs/superpowers/specs/2026-09-09-podcast-frame-picker-v2-design.md`.

**Tech Stack:** Next.js 16 route handlers (Node runtime), vitest, sharp 0.35; worker-edit = Python 3.11 / FastAPI 0.115 / pytest + httpx, ffmpeg via apt in `python:3.11-slim`, deployed with `fly deploy` (app `oceano-edit-engine`); Dropbox HTTP API v2; Make.com scenario 5918919.

## Global Constraints

- Repo to operate on: `/Users/oceano/oceano-blue-ops/oceano-blue-ops` (the nested checkout; the outer directory is a stale copy). Use absolute paths / `git -C`.
- Worker auth header is exactly `x-edit-secret` == env `EDIT_WORKER_SECRET`; app-side env names are `EDIT_ENGINE_URL`, `EDIT_WORKER_SECRET` (already set in Vercel and Fly).
- Route auth is exactly `x-pos-automation-secret` == env `POS_AUTOMATION_SECRET` (unchanged from v1).
- Frame sampling: `count` frames evenly spaced across `[5 %, 95 %]` of the duration (inclusive); `count` clamped 1..24, `long_edge` clamped 320..1920; ffmpeg limits: 4 concurrent, 45 s per frame, 150 s total, 30 s probe.
- Route time budget `maxDuration = 300`; app→worker timeout 170 000 ms.
- Dropbox output folder: `${showFolderPath(show_slug)}/Thumbnails/frames/${basename}/` with files `candidates.jpg`, `hosts.jpg`, `guest.jpg`; `basename` = filename without extension, lower-cased (same as Make's `ref_base`).
- Response keeps every v1 field and adds `frame_source: "video" | "youtube"` and `frames_folder: string | null`.
- A picker miss or any upstream failure is never a 5xx from the route.
- Never paste or log secrets. Never read Make execution *detail* logs for scenario 5918919 (module 13's request carries the automation secret).
- Commit directly to `main` (owner's standing instruction during this active work); push after each task's tests pass.

---

## File Structure

| File | Responsibility |
|---|---|
| `worker-edit/frames.py` (new) | `frame_timestamps`, `run_subprocess`, `probe_duration`, `extract_frames`, `FrameError` — all ffmpeg logic, no HTTP |
| `worker-edit/server.py` (modify, end of file) | `POST /frames` endpoint: auth, validation, clamping, error mapping |
| `worker-edit/test_frames.py` (new) | timestamp unit test, HTTP contract test with a fake runner, real-ffmpeg test (skips without ffmpeg) |
| `worker-edit/Dockerfile` (modify) | apt `ffmpeg`, COPY `frames.py` |
| `worker-edit/README.md` (modify) | document `/frames` |
| `lib/ai/edit-engine.ts` (modify) | `extractFrames(url, opts)` client + `ExtractedFrame` type |
| `lib/ai/edit-engine.test.ts` (new) | fetch-stubbed test of `extractFrames` |
| `lib/podcasts/episode-source.ts` (new) | `episodeBasename`, `resolveEpisodeSource` (youtube_id → Dropbox path) |
| `lib/podcasts/episode-source.test.ts` (new) | `episodeBasename` cases + resolver with a fake admin client |
| `lib/integrations/dropbox.ts` (modify) | `headerSafeJson`, `dbxContentCall`, `uploadFile` |
| `lib/integrations/dropbox.test.ts` (new) | `headerSafeJson` test |
| `lib/podcasts/contact-sheet.ts` (new) | `sheetLayout` (pure) + `buildContactSheet` (sharp) |
| `lib/podcasts/contact-sheet.test.ts` (new) | layout geometry + one real sharp render |
| `lib/podcasts/frame-picker.ts` (modify) | `PickFramesOutput` gains `frame_source`, `frames_folder`; new pure `buildPickOutput` |
| `lib/podcasts/frame-picker.test.ts` (modify) | `buildPickOutput` cases |
| `app/api/automations/podcast/pick-frames/route.ts` (rewrite) | v2 orchestration |

---

### Task 1: worker-edit `frames.py` — timestamps + extraction (pure Python, injectable runner)

**Files:**
- Create: `worker-edit/frames.py`
- Test: `worker-edit/test_frames.py`

**Interfaces:**
- Produces: `frame_timestamps(duration: float, count: int, start=0.05, end=0.95) -> list[float]`; `class FrameError(Exception)`; `async run_subprocess(args: list[str], timeout: float) -> tuple[int, bytes, bytes]`; `async probe_duration(url: str, runner=None) -> float`; `async extract_frames(url: str, count: int = 12, long_edge: int = 1280, runner=None) -> dict` returning `{"duration": float, "frames": [{"index": int, "t": float, "jpeg_b64": str}]}`. `runner=None` means "look up `frames.run_subprocess` at call time" so tests can monkeypatch it.

- [ ] **Step 1: Write the failing tests**

Create `worker-edit/test_frames.py`:

```python
"""Frame extraction for the podcast thumbnail picker (v2).
Run with: pip install pytest httpx && pytest -q test_frames.py
"""

import asyncio
import base64
import json
import shutil
import subprocess

import cv2
import numpy as np
import pytest

import frames


def test_frame_timestamps_spacing():
    ts = frames.frame_timestamps(100.0, 12)
    assert len(ts) == 12
    assert ts[0] == pytest.approx(5.0)
    assert ts[-1] == pytest.approx(95.0)
    assert all(b > a for a, b in zip(ts, ts[1:]))


def test_frame_timestamps_edges():
    assert frames.frame_timestamps(100.0, 1) == [50.0]
    assert frames.frame_timestamps(0.0, 12) == []
    assert frames.frame_timestamps(100.0, 0) == []


def _jpeg(w=128, h=72):
    ok, buf = cv2.imencode(".jpg", np.full((h, w, 3), 90, dtype=np.uint8))
    assert ok
    return buf.tobytes()


def test_extract_frames_drops_failed_frames_and_keeps_1_based_indexes():
    ts = frames.frame_timestamps(120.0, 4)
    jpeg = _jpeg()
    seen = []

    async def fake_run(args, timeout):
        seen.append(args)
        if args[0] == "ffprobe":
            return 0, json.dumps({"format": {"duration": "120.0"}}).encode(), b""
        t = float(args[args.index("-ss") + 1])
        if abs(t - ts[1]) < 1e-6:
            return 1, b"", b"boom"
        return 0, jpeg, b""

    out = asyncio.run(frames.extract_frames("https://x/y.mp4", count=4, long_edge=640, runner=fake_run))
    assert out["duration"] == 120.0
    assert [f["index"] for f in out["frames"]] == [1, 3, 4]
    assert [f["t"] for f in out["frames"]] == [ts[0], ts[2], ts[3]]
    assert base64.b64decode(out["frames"][0]["jpeg_b64"]).startswith(b"\xff\xd8")
    # input-side seek: -ss must come BEFORE -i so ffmpeg range-reads instead of downloading everything
    ff = [a for a in seen if a[0] == "ffmpeg"][0]
    assert ff.index("-ss") < ff.index("-i")
    assert "scale=640:-2" in ff


def test_extract_frames_raises_when_nothing_decodes():
    async def fake_run(args, timeout):
        if args[0] == "ffprobe":
            return 0, json.dumps({"format": {"duration": "10"}}).encode(), b""
        return 1, b"", b"nope"

    with pytest.raises(frames.FrameError, match="no_frames"):
        asyncio.run(frames.extract_frames("https://x/y.mp4", count=3, runner=fake_run))


def test_probe_failure_is_a_frame_error():
    async def fake_run(args, timeout):
        return 1, b"", b"403 Forbidden"

    with pytest.raises(frames.FrameError, match="probe_failed"):
        asyncio.run(frames.extract_frames("https://x/y.mp4", count=3, runner=fake_run))


@pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None, reason="ffmpeg not installed")
def test_extract_frames_real_ffmpeg(tmp_path):
    src = tmp_path / "test.mp4"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25",
         "-t", "4", "-pix_fmt", "yuv420p", str(src)],
        check=True,
    )
    out = asyncio.run(frames.extract_frames(str(src), count=3, long_edge=320))
    assert out["duration"] == pytest.approx(4.0, abs=0.2)
    assert [f["index"] for f in out["frames"]] == [1, 2, 3]
    ts = [f["t"] for f in out["frames"]]
    assert ts == sorted(ts) and len(set(ts)) == 3
    for f in out["frames"]:
        img = cv2.imdecode(np.frombuffer(base64.b64decode(f["jpeg_b64"]), np.uint8), cv2.IMREAD_COLOR)
        assert img is not None
        assert img.shape[1] == 320
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops/worker-edit && python3 -m pytest -q test_frames.py`
Expected: collection error `ModuleNotFoundError: No module named 'frames'`. (If pytest/httpx are missing: `python3 -m pip install pytest httpx==0.28.1 -r requirements.txt`.)

- [ ] **Step 3: Implement `frames.py`**

Create `worker-edit/frames.py`:

```python
"""
Frame extraction for the podcast thumbnail picker (frame picker v2).

Given an http(s) URL of the episode's delivered mp4 (a Dropbox temporary link),
sample `count` frames evenly across 5 %..95 % of the runtime. Each frame is its
own ffmpeg process with an INPUT-side seek (`-ss` before `-i`), so ffmpeg
range-reads only the moov atom plus the GOP it needs instead of downloading the
whole file. Frames that fail are dropped; the caller decides what a partial set
means. No HTTP here — server.py owns auth/validation.
"""

import asyncio
import base64
import json
from typing import Awaitable, Callable, List, Optional, Tuple

RunResult = Tuple[int, bytes, bytes]  # returncode, stdout, stderr
Runner = Callable[[List[str], float], Awaitable[RunResult]]

PROBE_TIMEOUT = 30.0
FRAME_TIMEOUT = 45.0
TOTAL_TIMEOUT = 150.0
MAX_PARALLEL = 4
MIN_FRAME_BYTES = 200  # anything smaller is not a real JPEG frame


class FrameError(Exception):
    """Extraction could not produce a usable result; message is the reason."""


def frame_timestamps(duration: float, count: int, start: float = 0.05, end: float = 0.95) -> List[float]:
    """`count` seconds-offsets evenly spaced across [start, end] of the runtime
    (inclusive). count == 1 → the midpoint of that window."""
    if duration <= 0 or count <= 0:
        return []
    lo, hi = duration * start, duration * end
    if count == 1:
        return [round((lo + hi) / 2, 3)]
    step = (hi - lo) / (count - 1)
    return [round(lo + i * step, 3) for i in range(count)]


async def run_subprocess(args: List[str], timeout: float) -> RunResult:
    """Run a command, capturing stdout/stderr. A timeout (or cancellation) kills
    the process so a stuck ffmpeg can't outlive the request."""
    proc = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        proc.kill()
        await proc.wait()
        raise
    return (proc.returncode or 0, out, err)


async def _run(args: List[str], timeout: float, runner: Optional[Runner]) -> RunResult:
    fn = runner or run_subprocess  # late lookup so tests can monkeypatch frames.run_subprocess
    try:
        return await fn(args, timeout)
    except asyncio.TimeoutError:
        return (-1, b"", b"timeout")


async def probe_duration(url: str, runner: Optional[Runner] = None) -> float:
    args = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", url]
    rc, out, err = await _run(args, PROBE_TIMEOUT, runner)
    if rc != 0:
        raise FrameError(f"probe_failed: {err.decode(errors='replace')[:200]}")
    try:
        duration = float(json.loads(out)["format"]["duration"])
    except (ValueError, KeyError, TypeError):
        raise FrameError("probe_failed: no duration")
    if duration <= 0:
        raise FrameError("probe_failed: zero duration")
    return duration


async def extract_frames(
    url: str,
    count: int = 12,
    long_edge: int = 1280,
    runner: Optional[Runner] = None,
) -> dict:
    duration = await probe_duration(url, runner)
    timestamps = frame_timestamps(duration, count)
    sem = asyncio.Semaphore(MAX_PARALLEL)

    async def one(index: int, t: float):
        args = [
            "ffmpeg", "-v", "error",
            "-ss", f"{t:.3f}", "-i", url,          # input-side seek → range reads only
            "-frames:v", "1",
            "-vf", f"scale={long_edge}:-2",         # width = long_edge, even height
            "-f", "image2", "-c:v", "mjpeg", "-q:v", "3",
            "pipe:1",
        ]
        async with sem:
            rc, out, _err = await _run(args, FRAME_TIMEOUT, runner)
        if rc != 0 or len(out) < MIN_FRAME_BYTES:
            return None
        return {"index": index, "t": t, "jpeg_b64": base64.b64encode(out).decode("ascii")}

    try:
        results = await asyncio.wait_for(
            asyncio.gather(*(one(i + 1, t) for i, t in enumerate(timestamps))),
            TOTAL_TIMEOUT,
        )
    except asyncio.TimeoutError:
        raise FrameError("extract_timeout")

    frames = [r for r in results if r is not None]
    if not frames:
        raise FrameError("no_frames")
    return {"duration": duration, "frames": frames}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops/worker-edit && python3 -m pytest -q test_frames.py`
Expected: `6 passed` (the real-ffmpeg test runs locally because Homebrew ffmpeg is installed; it reports `skipped` on machines without ffmpeg).

- [ ] **Step 5: Commit**

```bash
cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && git add worker-edit/frames.py worker-edit/test_frames.py && git commit -m "feat(worker-edit): ffmpeg frame sampler for podcast thumbnails

Samples N frames across 5-95% of a video URL with input-side seeks (range
reads, not a full download), 4 in parallel, per-frame + total timeouts; failed
frames are dropped, zero frames is an error. Injectable runner for tests.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: worker-edit `POST /frames` endpoint + Dockerfile + README

**Files:**
- Modify: `worker-edit/server.py` (imports at top; new endpoint appended after `/edit`, i.e. after line 696)
- Modify: `worker-edit/Dockerfile:5-12`
- Modify: `worker-edit/README.md` (new section after the `/edit` table)
- Test: `worker-edit/test_frames.py` (append)

**Interfaces:**
- Consumes: `frames.extract_frames`, `frames.FrameError` (Task 1).
- Produces: `POST /frames` JSON `{url, count?, long_edge?}` → 200 `{duration, frames:[{index,t,jpeg_b64}]}`; 401 unauthorized; 400 `bad_url`; 502 `{detail: <FrameError message>}`.

- [ ] **Step 1: Append the failing contract tests**

Append to `worker-edit/test_frames.py`:

```python
from fastapi.testclient import TestClient

import server


def test_frames_endpoint_contract(monkeypatch):
    monkeypatch.setattr(server, "SECRET", "test-edit-secret")
    jpeg = _jpeg()

    async def fake_run(args, timeout):
        if args[0] == "ffprobe":
            return 0, json.dumps({"format": {"duration": "120.0"}}).encode(), b""
        return 0, jpeg, b""

    monkeypatch.setattr(frames, "run_subprocess", fake_run)

    with TestClient(server.app) as client:
        assert client.post("/frames", json={"url": "https://x/y.mp4"}).status_code == 401
        headers = {"x-edit-secret": "test-edit-secret"}
        assert client.post("/frames", json={"url": "file:///etc/passwd"}, headers=headers).status_code == 400
        r = client.post("/frames", json={"url": "https://x/y.mp4", "count": 3}, headers=headers)

    assert r.status_code == 200
    body = r.json()
    assert body["duration"] == 120.0
    assert [f["index"] for f in body["frames"]] == [1, 2, 3]
    assert base64.b64decode(body["frames"][0]["jpeg_b64"]).startswith(b"\xff\xd8")


def test_frames_endpoint_clamps_count(monkeypatch):
    monkeypatch.setattr(server, "SECRET", "test-edit-secret")
    calls = []

    async def fake_run(args, timeout):
        calls.append(args)
        if args[0] == "ffprobe":
            return 0, json.dumps({"format": {"duration": "60"}}).encode(), b""
        return 0, _jpeg(), b""

    monkeypatch.setattr(frames, "run_subprocess", fake_run)
    with TestClient(server.app) as client:
        r = client.post("/frames", json={"url": "https://x/y.mp4", "count": 999, "long_edge": 5},
                        headers={"x-edit-secret": "test-edit-secret"})
    assert r.status_code == 200
    assert len(r.json()["frames"]) == 24
    assert any("scale=320:-2" in a for a in calls if a[0] == "ffmpeg")


def test_frames_endpoint_maps_frame_error_to_502(monkeypatch):
    monkeypatch.setattr(server, "SECRET", "test-edit-secret")

    async def fake_run(args, timeout):
        return 1, b"", b"denied"

    monkeypatch.setattr(frames, "run_subprocess", fake_run)
    with TestClient(server.app) as client:
        r = client.post("/frames", json={"url": "https://x/y.mp4"}, headers={"x-edit-secret": "test-edit-secret"})
    assert r.status_code == 502
    assert r.json()["detail"].startswith("probe_failed")
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops/worker-edit && python3 -m pytest -q test_frames.py -k endpoint`
Expected: 3 FAIL with `assert 404 == 401` (route does not exist yet).

- [ ] **Step 3: Add the endpoint to `server.py`**

At the top of `worker-edit/server.py`, extend the FastAPI import (line 29) and add two imports after it:

```python
from fastapi import FastAPI, File, Form, Header, HTTPException, Response, UploadFile
from pydantic import BaseModel

import frames as frames_mod
from frames import FrameError
```

Append at the end of `worker-edit/server.py` (after the `/edit` handler's `return Response(...)`):

```python
# ─── Podcast thumbnail frames (frame picker v2) ──────────────────────────────
# Sample frames from a video URL (a Dropbox temporary link) so the app's vision
# picker can choose hosts/guest shots from the episode itself instead of
# YouTube's three auto-frames. ffmpeg lives in the image (Dockerfile).


class FramesRequest(BaseModel):
    url: str
    count: int = 12
    long_edge: int = 1280


@app.post("/frames")
async def frames_endpoint(req: FramesRequest, x_edit_secret: Optional[str] = Header(None)):
    if not SECRET or x_edit_secret != SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")
    if not req.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="bad_url")
    count = max(1, min(24, req.count))
    long_edge = max(320, min(1920, req.long_edge))
    try:
        # runner=None → frames.run_subprocess looked up at call time (tests monkeypatch it)
        return await frames_mod.extract_frames(req.url, count=count, long_edge=long_edge)
    except FrameError as e:
        raise HTTPException(status_code=502, detail=str(e))
```

- [ ] **Step 4: Run the whole worker test suite**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops/worker-edit && python3 -m pytest -q`
Expected: all pass (`test_frames.py` 9 passed, existing suites unchanged).

- [ ] **Step 5: Dockerfile + README**

Replace lines 5–12 of `worker-edit/Dockerfile` with:

```dockerfile
# OpenCV (headless) still needs libglib at runtime. ffmpeg/ffprobe power the
# podcast frame sampler (/frames).
RUN apt-get update \
  && apt-get install -y --no-install-recommends libglib2.0-0 ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py window_pull.py geometry.py masks.py sky.py frames.py .
```

Insert in `worker-edit/README.md`, right after the paragraph `Header `x-edit-secret` must match `EDIT_WORKER_SECRET`. Returns `image/jpeg`.`:

```markdown
## Frame sampling (`POST /frames`, JSON)

Used by the podcast thumbnail picker (v2). Body `{ "url": "<http(s) video url>",
"count": 12, "long_edge": 1280 }` (count clamped 1..24, long_edge 320..1920).
Samples `count` frames evenly across 5–95 % of the runtime with input-side
ffmpeg seeks (range reads; the file is never fully downloaded), 4 in parallel,
45 s per frame / 150 s total. Returns
`{ "duration": <seconds>, "frames": [ { "index": 1.., "t": <seconds>, "jpeg_b64": "..." } ] }`;
frames that fail are dropped, zero frames → 502. Same `x-edit-secret` header.
```

- [ ] **Step 6: Build the image locally to prove ffmpeg installs (Docker optional)**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops/worker-edit && (docker build -t oceano-edit-engine:frames . && docker run --rm oceano-edit-engine:frames ffmpeg -version | head -1) || echo "docker not available — Fly builds remotely in Task 8"`
Expected: `ffmpeg version 5.x` or the fallback message.

- [ ] **Step 7: Commit**

```bash
cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && git add worker-edit/server.py worker-edit/test_frames.py worker-edit/Dockerfile worker-edit/README.md && git commit -m "feat(worker-edit): POST /frames — video frame sampling endpoint

x-edit-secret auth, http(s)-only URLs, count/long_edge clamped, FrameError → 502.
ffmpeg added to the image.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: App client `extractFrames` in `lib/ai/edit-engine.ts`

**Files:**
- Modify: `lib/ai/edit-engine.ts` (append after `runEditEngine`, line 66)
- Test: `lib/ai/edit-engine.test.ts` (new)

**Interfaces:**
- Produces: `export interface ExtractedFrame { index: number; t: number; bytes: Buffer }`; `export async function extractFrames(url: string, opts?: { count?: number; longEdge?: number; timeoutMs?: number }): Promise<{ duration: number; frames: ExtractedFrame[] }>` — throws `edit_engine_not_configured` or `edit_engine_<status>: <body>`.

- [ ] **Step 1: Write the failing test**

Create `lib/ai/edit-engine.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractFrames } from './edit-engine';

describe('extractFrames', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.EDIT_ENGINE_URL = 'https://engine.test/';
    process.env.EDIT_WORKER_SECRET = 'shh';
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it('posts JSON to /frames with the secret and decodes base64 frames', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ duration: 12.5, frames: [{ index: 1, t: 0.6, jpeg_b64: Buffer.from('abc').toString('base64') }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await extractFrames('https://dl.dropboxusercontent.com/x.mp4', { count: 5, longEdge: 640 });

    expect(out.duration).toBe(12.5);
    expect(out.frames).toHaveLength(1);
    expect(out.frames[0].bytes.toString()).toBe('abc');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://engine.test/frames');
    expect((init.headers as Record<string, string>)['x-edit-secret']).toBe('shh');
    expect(JSON.parse(String(init.body))).toEqual({ url: 'https://dl.dropboxusercontent.com/x.mp4', count: 5, long_edge: 640 });
  });

  it('throws a status-tagged error on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('probe_failed: 403', { status: 502 })));
    await expect(extractFrames('https://x/y.mp4')).rejects.toThrow('edit_engine_502: probe_failed: 403');
  });

  it('throws when unconfigured', async () => {
    delete process.env.EDIT_ENGINE_URL;
    await expect(extractFrames('https://x/y.mp4')).rejects.toThrow('edit_engine_not_configured');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && npx vitest run lib/ai/edit-engine.test.ts`
Expected: FAIL — `extractFrames` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/ai/edit-engine.ts`:

```ts
export interface ExtractedFrame {
  index: number; // 1-based position in the sampled sequence (earliest = 1)
  t: number; // seconds into the video
  bytes: Buffer; // JPEG
}

/**
 * Sample frames from a video URL via the engine's `/frames` endpoint (ffmpeg
 * on the worker; the file is range-read, never fully downloaded). Used by the
 * podcast thumbnail picker. Throws like runEditEngine; callers should check
 * editEngineConfigured() first and treat any throw as "use the fallback".
 */
export async function extractFrames(
  url: string,
  opts: { count?: number; longEdge?: number; timeoutMs?: number } = {}
): Promise<{ duration: number; frames: ExtractedFrame[] }> {
  const base = process.env.EDIT_ENGINE_URL;
  const secret = process.env.EDIT_WORKER_SECRET;
  if (!base || !secret) throw new Error('edit_engine_not_configured');

  const r = await fetch(`${base.replace(/\/$/, '')}/frames`, {
    method: 'POST',
    headers: { 'x-edit-secret': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, count: opts.count ?? 12, long_edge: opts.longEdge ?? 1280 }),
    // The worker caps itself at 150 s; leave headroom for a cold Fly machine.
    signal: AbortSignal.timeout(opts.timeoutMs ?? 170_000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`edit_engine_${r.status}: ${body.slice(0, 200)}`);
  }
  const json = (await r.json()) as { duration: number; frames?: { index: number; t: number; jpeg_b64: string }[] };
  return {
    duration: json.duration,
    frames: (json.frames ?? []).map((f) => ({ index: f.index, t: f.t, bytes: Buffer.from(f.jpeg_b64, 'base64') })),
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && npx vitest run lib/ai/edit-engine.test.ts && npm run typecheck`
Expected: 3 passed; typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && git add lib/ai/edit-engine.ts lib/ai/edit-engine.test.ts && git commit -m "feat(edit-engine): extractFrames client for the worker's /frames endpoint

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `lib/podcasts/episode-source.ts` — youtube_id → Dropbox mp4

**Files:**
- Create: `lib/podcasts/episode-source.ts`
- Test: `lib/podcasts/episode-source.test.ts`

**Interfaces:**
- Produces: `export function episodeBasename(filename: string): string`; `export type EpisodeSource = { episodeId: string; jobId: string; dropboxPath: string; basename: string }`; `export async function resolveEpisodeSource(admin: any, youtubeId: string): Promise<EpisodeSource | null>` (never throws).
- Data it reads: `external_links(job_id)` where `link_type='youtube_video'`, `external_id=youtubeId`; `podcast_episodes(id, job_id, metadata)` by `job_id` (`metadata.dropbox_path`, `metadata.filename`); fallback `assets(local_path, filename)` by `job_id`, `asset_type='source'`.

- [ ] **Step 1: Write the failing tests**

Create `lib/podcasts/episode-source.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { episodeBasename, resolveEpisodeSource } from './episode-source';

describe('episodeBasename', () => {
  it('strips folders + video extension and lower-cases (matches Make ref_base)', () => {
    expect(episodeBasename('oceanoblue_MindYourHealthAugust_mindyourhealthaugustSophiaTownes_v1.mp4')).toBe(
      'oceanoblue_mindyourhealthaugust_mindyourhealthaugustsophiatownes_v1'
    );
    expect(episodeBasename('/Podcasts/mind-your-health/02-Edited/ep.MOV')).toBe('ep');
    expect(episodeBasename('  noext ')).toBe('noext');
  });
});

/** Minimal chainable fake of the supabase-js query builder, one table at a time. */
function fakeAdmin(rows: Record<string, unknown | null>) {
  return {
    from(table: string) {
      const q: any = {
        select: () => q,
        eq: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows[table] ?? null }),
      };
      return q;
    },
  };
}

describe('resolveEpisodeSource', () => {
  it('walks external_links → podcast_episodes.metadata', async () => {
    const admin = fakeAdmin({
      external_links: { job_id: 'job1' },
      podcast_episodes: { id: 'ep1', job_id: 'job1', metadata: { dropbox_path: '/Podcasts/mind-your-health/02-Edited/X_v1.mp4', filename: 'X_v1.mp4' } },
    });
    expect(await resolveEpisodeSource(admin, 'abc')).toEqual({
      episodeId: 'ep1',
      jobId: 'job1',
      dropboxPath: '/Podcasts/mind-your-health/02-Edited/X_v1.mp4',
      basename: 'x_v1',
    });
  });

  it('falls back to the source asset when metadata has no dropbox_path', async () => {
    const admin = fakeAdmin({
      external_links: { job_id: 'job1' },
      podcast_episodes: { id: 'ep1', job_id: 'job1', metadata: {} },
      assets: { local_path: '/old/RENDERS/Y.mp4', filename: 'Y.mp4' },
    });
    expect((await resolveEpisodeSource(admin, 'abc'))?.basename).toBe('y');
  });

  it('returns null when the chain breaks', async () => {
    expect(await resolveEpisodeSource(fakeAdmin({}), 'abc')).toBeNull();
    expect(await resolveEpisodeSource(fakeAdmin({ external_links: { job_id: 'job1' } }), 'abc')).toBeNull();
    expect(
      await resolveEpisodeSource(fakeAdmin({ external_links: { job_id: 'job1' }, podcast_episodes: { id: 'ep1', job_id: 'job1', metadata: {} } }), 'abc')
    ).toBeNull();
  });

  it('never throws', async () => {
    const broken = { from() { throw new Error('db down'); } };
    expect(await resolveEpisodeSource(broken, 'abc')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && npx vitest run lib/podcasts/episode-source.test.ts`
Expected: FAIL — cannot resolve `./episode-source`.

- [ ] **Step 3: Implement**

Create `lib/podcasts/episode-source.ts`:

```ts
/**
 * Where is this episode's delivered video? The thumbnail picker (v2) samples
 * frames from the editor's mp4 in Dropbox, so it needs youtube_id → file path.
 *
 * Chain (all written by the Make intake / youtube.uploaded callbacks):
 *   external_links(link_type='youtube_video', external_id=<youtube_id>).job_id
 *     → podcast_episodes(job_id).metadata.dropbox_path (+ .filename)
 *     → fallback: assets(job_id, asset_type='source').local_path
 * Any missing link returns null — the caller falls back to YouTube's frames.
 */

export type EpisodeSource = {
  episodeId: string;
  jobId: string;
  dropboxPath: string;
  /** filename without extension, lower-cased — same as the Make scenario's `ref_base` */
  basename: string;
};

export function episodeBasename(filename: string): string {
  return filename
    .trim()
    .replace(/^.*[\\/]/, '')
    .replace(/\.(mp4|mov|m4v)$/i, '')
    .trim()
    .toLowerCase();
}

// `admin` is the service-role client; typed loosely like the other automation
// routes (createAdminClient() as any) so jsonb metadata reads don't fight the
// generated types.
export async function resolveEpisodeSource(admin: any, youtubeId: string): Promise<EpisodeSource | null> {
  try {
    const { data: link } = await admin
      .from('external_links')
      .select('job_id')
      .eq('link_type', 'youtube_video')
      .eq('external_id', youtubeId)
      .limit(1)
      .maybeSingle();
    if (!link?.job_id) return null;

    const { data: ep } = await admin
      .from('podcast_episodes')
      .select('id, job_id, metadata')
      .eq('job_id', link.job_id)
      .limit(1)
      .maybeSingle();
    if (!ep) return null;

    const meta = (ep.metadata ?? {}) as Record<string, unknown>;
    let dropboxPath = typeof meta.dropbox_path === 'string' && meta.dropbox_path ? meta.dropbox_path : null;
    let filename = typeof meta.filename === 'string' && meta.filename ? meta.filename : null;

    if (!dropboxPath) {
      const { data: asset } = await admin
        .from('assets')
        .select('local_path, filename')
        .eq('job_id', link.job_id)
        .eq('asset_type', 'source')
        .limit(1)
        .maybeSingle();
      dropboxPath = asset?.local_path ?? null;
      filename = filename ?? asset?.filename ?? null;
    }
    if (!dropboxPath) return null;

    const basename = episodeBasename(filename ?? dropboxPath);
    if (!basename) return null;
    return { episodeId: ep.id, jobId: ep.job_id, dropboxPath, basename };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && npx vitest run lib/podcasts/episode-source.test.ts && npm run typecheck`
Expected: 5 passed; typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && git add lib/podcasts/episode-source.ts lib/podcasts/episode-source.test.ts && git commit -m "feat(podcast): resolve youtube_id → episode Dropbox video path

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Dropbox `uploadFile` (content endpoint with the team-token retry)

**Files:**
- Modify: `lib/integrations/dropbox.ts` (add after `dbxUserCall`, line 184; add `uploadFile` after `movePath`, line 348)
- Test: `lib/integrations/dropbox.test.ts` (new)

**Interfaces:**
- Produces: `export function headerSafeJson(value: unknown): string` (JSON with all non-ASCII escaped as `\uXXXX` — Dropbox-API-Arg must be ASCII); `export type UploadResult = { status: 'ok' } | { status: 'not_configured' } | { status: 'failed'; error: string }`; `export async function uploadFile(path: string, bytes: Buffer, opts?: { mode?: 'overwrite' | 'add' }): Promise<UploadResult>` (never throws).

- [ ] **Step 1: Write the failing test**

Create `lib/integrations/dropbox.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { headerSafeJson } from './dropbox';

describe('headerSafeJson', () => {
  it('escapes non-ASCII so the value is legal in an HTTP header', () => {
    const out = headerSafeJson({ path: '/Podcasts/Mind Your Health/señor.jpg', mode: 'overwrite' });
    expect(out).toBe('{"path":"/Podcasts/Mind Your Health/se\\u00f1or.jpg","mode":"overwrite"}');
    expect(/[^\x00-\x7f]/.test(out)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && npx vitest run lib/integrations/dropbox.test.ts`
Expected: FAIL — `headerSafeJson` is not exported.

- [ ] **Step 3: Implement**

Insert after `dbxUserCall` (after line 184) in `lib/integrations/dropbox.ts`:

```ts
/** JSON for the `Dropbox-API-Arg` header, which must be pure ASCII. */
export function headerSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** POST a content-endpoint call (binary body + Dropbox-API-Arg); same team-token retry as dbxUserCall. */
async function dbxContentCall(token: string, url: string, apiArg: unknown, body: Buffer): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Dropbox-API-Arg': headerSafeJson(apiArg),
    'Content-Type': 'application/octet-stream',
  };
  const send = (extra: Record<string, string> = {}) =>
    fetch(url, { method: 'POST', headers: { ...headers, ...extra }, body: new Uint8Array(body) });
  const first = await send();
  if (first.status !== 400) return first;

  const text = await first.clone().text();
  if (!text.includes(TEAM_TOKEN_400)) return first;

  const memberId = await resolveTeamMemberId(token);
  if (!memberId) return first;
  return send({ 'Dropbox-API-Select-User': memberId });
}
```

Insert after `movePath` (after line 348):

```ts
// ─── Writing small files (podcast thumbnail frames) ──────────────────────────

export type UploadResult = { status: 'ok' } | { status: 'not_configured' } | { status: 'failed'; error: string };

/** Upload one file (< 150 MB) in a single request. Best-effort: never throws. */
export async function uploadFile(
  path: string,
  bytes: Buffer,
  opts: { mode?: 'overwrite' | 'add' } = {}
): Promise<UploadResult> {
  if (!isDropboxConfigured()) return { status: 'not_configured' };
  try {
    const token = await getAccessToken();
    const res = await dbxContentCall(
      token,
      'https://content.dropboxapi.com/2/files/upload',
      { path, mode: opts.mode ?? 'overwrite', mute: true },
      bytes
    );
    if (res.ok) return { status: 'ok' };
    return { status: 'failed', error: `dropbox_upload_${res.status}: ${await dropboxErrorDetail(res)}` };
  } catch (e: any) {
    return { status: 'failed', error: e?.message ?? 'dropbox_error' };
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && npx vitest run lib/integrations/dropbox.test.ts && npm run typecheck`
Expected: 1 passed; typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && git add lib/integrations/dropbox.ts lib/integrations/dropbox.test.ts && git commit -m "feat(dropbox): uploadFile via the content endpoint (team-token aware)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Contact sheet (`lib/podcasts/contact-sheet.ts`)

**Files:**
- Create: `lib/podcasts/contact-sheet.ts`
- Test: `lib/podcasts/contact-sheet.test.ts`

**Interfaces:**
- Produces: `export type SheetOptions = { cols: number; tileW: number; tileH: number; gap: number }` (defaults `{ cols: 4, tileW: 320, tileH: 180, gap: 8 }`); `export function sheetLayout(indexes: number[], opts?: Partial<SheetOptions>): { width: number; height: number; tiles: { index: number; left: number; top: number }[] }`; `export async function buildContactSheet(frames: { index: number; bytes: Buffer }[], opts?: Partial<SheetOptions>): Promise<Buffer>` (JPEG; throws `no_frames` on empty input).

- [ ] **Step 1: Write the failing tests**

Create `lib/podcasts/contact-sheet.test.ts`:

```ts
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { buildContactSheet, sheetLayout } from './contact-sheet';

describe('sheetLayout', () => {
  it('lays 12 tiles in a 4x3 grid with gutters', () => {
    const l = sheetLayout([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(l.width).toBe(8 + 4 * (320 + 8));
    expect(l.height).toBe(8 + 3 * (180 + 8));
    expect(l.tiles[0]).toEqual({ index: 1, left: 8, top: 8 });
    expect(l.tiles[4]).toEqual({ index: 5, left: 8, top: 8 + 188 });
    expect(l.tiles[11]).toEqual({ index: 12, left: 8 + 3 * 328, top: 8 + 2 * 188 });
  });

  it('shrinks the canvas to the used columns/rows', () => {
    expect(sheetLayout([1]).width).toBe(8 + 328);
    expect(sheetLayout([1, 2, 3, 4, 5]).height).toBe(8 + 2 * 188);
  });
});

describe('buildContactSheet', () => {
  it('renders a JPEG of the computed size', async () => {
    const tile = await sharp({ create: { width: 64, height: 36, channels: 3, background: '#888' } }).jpeg().toBuffer();
    const out = await buildContactSheet([1, 2, 3].map((index) => ({ index, bytes: tile })));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(8 + 3 * 328);
    expect(meta.height).toBe(8 + 188);
  });

  it('rejects an empty set', async () => {
    await expect(buildContactSheet([])).rejects.toThrow('no_frames');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && npx vitest run lib/podcasts/contact-sheet.test.ts`
Expected: FAIL — cannot resolve `./contact-sheet`.

- [ ] **Step 3: Implement**

Create `lib/podcasts/contact-sheet.ts`:

```ts
import sharp from 'sharp';

/**
 * One JPEG showing every candidate frame the picker considered, numbered, so
 * the owner can see (in Dropbox) why a hosts/guest frame was or wasn't chosen.
 * Tiles read left→right, top→bottom in frame order, so even if the numeral
 * overlay fails to render (no fonts on a serverless host) the order is clear.
 */

export type SheetOptions = { cols: number; tileW: number; tileH: number; gap: number };
const DEFAULTS: SheetOptions = { cols: 4, tileW: 320, tileH: 180, gap: 8 };

export function sheetLayout(indexes: number[], opts: Partial<SheetOptions> = {}) {
  const { cols, tileW, tileH, gap } = { ...DEFAULTS, ...opts };
  const n = indexes.length;
  const rows = Math.max(1, Math.ceil(n / cols));
  const usedCols = Math.min(cols, Math.max(1, n));
  return {
    width: gap + usedCols * (tileW + gap),
    height: gap + rows * (tileH + gap),
    tiles: indexes.map((index, i) => ({
      index,
      left: gap + (i % cols) * (tileW + gap),
      top: gap + Math.floor(i / cols) * (tileH + gap),
    })),
  };
}

function numeral(n: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="24">` +
      `<rect width="44" height="24" rx="4" fill="#15204a" fill-opacity="0.85"/>` +
      `<text x="22" y="17" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">${n}</text>` +
      `</svg>`
  );
}

export async function buildContactSheet(
  frames: { index: number; bytes: Buffer }[],
  opts: Partial<SheetOptions> = {}
): Promise<Buffer> {
  if (frames.length === 0) throw new Error('no_frames');
  const o = { ...DEFAULTS, ...opts };
  const layout = sheetLayout(frames.map((f) => f.index), o);

  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < frames.length; i++) {
    const { left, top } = layout.tiles[i];
    const tile = await sharp(frames[i].bytes).resize(o.tileW, o.tileH, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
    composites.push({ input: tile, left, top });
    composites.push({ input: numeral(frames[i].index), left: left + 6, top: top + 6 });
  }

  return sharp({ create: { width: layout.width, height: layout.height, channels: 3, background: '#0b1230' } })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toBuffer();
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && npx vitest run lib/podcasts/contact-sheet.test.ts && npm run typecheck`
Expected: 4 passed; typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && git add lib/podcasts/contact-sheet.ts lib/podcasts/contact-sheet.test.ts && git commit -m "feat(podcast): numbered contact sheet of candidate frames

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `buildPickOutput` + extended `PickFramesOutput`

**Files:**
- Modify: `lib/podcasts/frame-picker.ts:31-37` (type) and append the helper at the end
- Test: `lib/podcasts/frame-picker.test.ts` (append)

**Interfaces:**
- Consumes: `PickerResult` (existing).
- Produces: `PickFramesOutput` now also has `frame_source: 'video' | 'youtube'` and `frames_folder: string | null`; `export function buildPickOutput(args: { picked: { result: PickerResult; model: string } | null; frameSource: 'video' | 'youtube'; framesConsidered: number; hostsReferenceUsed: boolean; hostsUrl: string | null; guestUrl: string | null; framesFolder: string | null; noteSuffix?: string }): PickFramesOutput`.

- [ ] **Step 1: Append the failing tests**

Append to `lib/podcasts/frame-picker.test.ts` (and extend the import line to `import { buildPickOutput, parsePickerResponse, youtubeFrameCandidates } from './frame-picker';`):

```ts
describe('buildPickOutput', () => {
  const picked = { result: { hosts_frame: 7, guest_frame: 3, guest_remote: false, notes: 'ok' }, model: 'gpt-5.4' };

  it('reports the video source, folder and links', () => {
    const out = buildPickOutput({
      picked,
      frameSource: 'video',
      framesConsidered: 12,
      hostsReferenceUsed: true,
      hostsUrl: 'https://dl/h.jpg',
      guestUrl: 'https://dl/g.jpg',
      framesFolder: '/Podcasts/mind-your-health/Thumbnails/frames/ep',
    });
    expect(out).toEqual({
      hosts_frame: 7,
      guest_frame: 3,
      guest_remote: false,
      notes: 'ok',
      hosts_frame_url: 'https://dl/h.jpg',
      guest_frame_url: 'https://dl/g.jpg',
      hosts_reference_used: true,
      frames_considered: 12,
      model: 'gpt-5.4',
      frame_source: 'video',
      frames_folder: '/Podcasts/mind-your-health/Thumbnails/frames/ep',
    });
  });

  it('appends an upload-failure note without touching the picks', () => {
    const out = buildPickOutput({
      picked,
      frameSource: 'video',
      framesConsidered: 12,
      hostsReferenceUsed: true,
      hostsUrl: null,
      guestUrl: 'https://dl/g.jpg',
      framesFolder: '/f',
      noteSuffix: ' (upload failed: dropbox_upload_409: path/conflict)',
    });
    expect(out.hosts_frame).toBe(7);
    expect(out.hosts_frame_url).toBeNull();
    expect(out.notes).toBe('ok (upload failed: dropbox_upload_409: path/conflict)');
  });

  it('is the v1 "picker unavailable" shape on a miss', () => {
    const out = buildPickOutput({ picked: null, frameSource: 'youtube', framesConsidered: 3, hostsReferenceUsed: false, hostsUrl: null, guestUrl: null, framesFolder: null });
    expect(out).toMatchObject({ hosts_frame: null, guest_frame: null, guest_remote: false, notes: 'Picker unavailable.', model: null, frame_source: 'youtube', frames_folder: null });
  });

  it('says so when there were no frames at all', () => {
    const out = buildPickOutput({ picked: null, frameSource: 'youtube', framesConsidered: 0, hostsReferenceUsed: true, hostsUrl: null, guestUrl: null, framesFolder: null });
    expect(out.notes).toBe('No video frames available yet.');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && npx vitest run lib/podcasts/frame-picker.test.ts`
Expected: FAIL — `buildPickOutput` is not exported.

- [ ] **Step 3: Implement**

Replace lines 31–37 of `lib/podcasts/frame-picker.ts` with:

```ts
export type PickFramesOutput = PickerResult & {
  hosts_frame_url: string | null;
  guest_frame_url: string | null;
  hosts_reference_used: boolean;
  frames_considered: number;
  model: string | null;
  /** 'video' = frames sampled from the episode mp4 (v2); 'youtube' = YouTube's auto-frames (v1 fallback) */
  frame_source: 'video' | 'youtube';
  /** Dropbox folder holding candidates.jpg / hosts.jpg / guest.jpg when frame_source is 'video' */
  frames_folder: string | null;
};
```

Append at the end of `lib/podcasts/frame-picker.ts`:

```ts
/** Assemble the route's response. A miss keeps the v1 "use your fallback" shape (nulls + a note). */
export function buildPickOutput(args: {
  picked: { result: PickerResult; model: string } | null;
  frameSource: 'video' | 'youtube';
  framesConsidered: number;
  hostsReferenceUsed: boolean;
  hostsUrl: string | null;
  guestUrl: string | null;
  framesFolder: string | null;
  noteSuffix?: string;
}): PickFramesOutput {
  const base: PickerResult = args.picked
    ? args.picked.result
    : {
        hosts_frame: null,
        guest_frame: null,
        guest_remote: false,
        notes: args.framesConsidered === 0 ? 'No video frames available yet.' : 'Picker unavailable.',
      };
  return {
    ...base,
    notes: `${base.notes}${args.noteSuffix ?? ''}`,
    hosts_frame_url: args.hostsUrl,
    guest_frame_url: args.guestUrl,
    hosts_reference_used: args.hostsReferenceUsed,
    frames_considered: args.framesConsidered,
    model: args.picked?.model ?? null,
    frame_source: args.frameSource,
    frames_folder: args.framesFolder,
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && npx vitest run lib/podcasts/frame-picker.test.ts && npm run typecheck`
Expected: 10 passed. **Typecheck will FAIL** in `app/api/automations/podcast/pick-frames/route.ts` because its two `PickFramesOutput` literals lack the new fields — that is expected and is fixed by Task 8. Do not commit a red typecheck: proceed straight to Task 8 and commit both together there.

---

### Task 8: `pick-frames` route v2 orchestration

**Files:**
- Rewrite: `app/api/automations/podcast/pick-frames/route.ts`
- (Commits Task 7's `frame-picker.ts` / test changes together with this.)

**Interfaces:**
- Consumes: `resolveEpisodeSource`, `extractFrames`/`editEngineConfigured`, `getTemporaryLink`/`uploadFile`/`isDropboxConfigured`/`showFolderPath`, `buildContactSheet`, `pickFramesWithVision`/`fetchImage`/`youtubeFrameCandidates`/`buildPickOutput`, `createAdminClient` from `@/lib/supabase/server`.
- Produces: the HTTP contract in the spec §6.

- [ ] **Step 1: Rewrite the route**

Replace the whole of `app/api/automations/podcast/pick-frames/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { editEngineConfigured, extractFrames } from '@/lib/ai/edit-engine';
import { getTemporaryLink, isDropboxConfigured, showFolderPath, uploadFile } from '@/lib/integrations/dropbox';
import { buildContactSheet } from '@/lib/podcasts/contact-sheet';
import { resolveEpisodeSource } from '@/lib/podcasts/episode-source';
import {
  buildPickOutput,
  fetchImage,
  pickFramesWithVision,
  youtubeFrameCandidates,
} from '@/lib/podcasts/frame-picker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Cold Fly machine + 12 ffmpeg seeks + vision + 3 Dropbox writes ≈ 40–60 s; cap at 5 min.
export const maxDuration = 300;

/**
 * Make → POS: pick the hosts + guest source frames for an episode thumbnail.
 *
 * v2: frames are sampled from the episode's own mp4 in Dropbox (worker-edit
 * /frames, ffmpeg) — 12 across the runtime — and the picks plus a numbered
 * contact sheet are written to <show>/Thumbnails/frames/<basename>/ so the
 * owner can see what was considered. If the video can't be reached for any
 * reason, v1 behaviour applies: YouTube's three auto-frames.
 *
 * Server-to-server, authenticated with the shared `x-pos-automation-secret`
 * header exactly like the Make callback. Body: { show_slug, youtube_id }.
 * Returns frame URLs for Make to download; nulls mean "use your fallback"
 * (refs/hosts.jpg for hosts, the mid-video YouTube frame for the guest).
 * Never a 5xx for a picker miss — a miss is a valid answer.
 */
const Body = z.object({
  show_slug: z.string().min(1).max(100),
  youtube_id: z.string().regex(/^[A-Za-z0-9_-]{6,20}$/),
});

const VIDEO_FRAME_COUNT = 12;

type Candidate = { index: number; bytes: Buffer; url: string | null };

function authorized(request: Request): boolean {
  const secret = process.env.POS_AUTOMATION_SECRET;
  if (!secret) return false;
  const presented = request.headers.get('x-pos-automation-secret') ?? '';
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

/** Standing identity reference: <show folder>/Thumbnails/refs/hosts.jpg */
async function loadHostsReference(showSlug: string): Promise<Buffer | null> {
  if (!isDropboxConfigured()) return null;
  try {
    const link = await getTemporaryLink(`${showFolderPath(showSlug)}/Thumbnails/refs/hosts.jpg`);
    return await fetchImage(link, 15_000);
  } catch {
    return null;
  }
}

/** v2 source: frames from the episode mp4. null = fall back to YouTube. */
async function loadVideoFrames(youtubeId: string, admin: any): Promise<{ frames: Candidate[]; basename: string } | null> {
  if (!isDropboxConfigured() || !editEngineConfigured()) return null;
  const source = await resolveEpisodeSource(admin, youtubeId);
  if (!source) {
    console.warn('[pick-frames] no Dropbox source for', youtubeId, '— using YouTube frames');
    return null;
  }
  try {
    const link = await getTemporaryLink(source.dropboxPath);
    const { frames } = await extractFrames(link, { count: VIDEO_FRAME_COUNT });
    if (frames.length === 0) return null;
    // Re-number 1..N in order so FRAME labels are contiguous even if the worker dropped some.
    return { basename: source.basename, frames: frames.map((f, i) => ({ index: i + 1, bytes: f.bytes, url: null })) };
  } catch (err) {
    console.warn('[pick-frames] video frames unavailable:', (err as Error)?.message ?? err);
    return null;
  }
}

/** v1 source: YouTube's auto-extracted frames (untouched by custom thumbnails). */
async function loadYoutubeFrames(youtubeId: string): Promise<Candidate[]> {
  const found = await Promise.all(
    [1, 2, 3].map(async (index) => {
      for (const url of youtubeFrameCandidates(youtubeId, index)) {
        const bytes = await fetchImage(url);
        if (bytes) return { index, bytes, url } as Candidate;
      }
      return null;
    })
  );
  return found.filter((f): f is Candidate => f !== null);
}

/** Write a picked frame to Dropbox and hand back a link Make can download; null + reason on failure. */
async function publishPick(
  folder: string,
  name: 'hosts' | 'guest',
  frame: Candidate | undefined
): Promise<{ url: string | null; reason: string | null }> {
  if (!frame) return { url: null, reason: null };
  const path = `${folder}/${name}.jpg`;
  const up = await uploadFile(path, frame.bytes);
  if (up.status !== 'ok') return { url: null, reason: `upload failed: ${up.status === 'failed' ? up.error : up.status}` };
  try {
    return { url: await getTemporaryLink(path), reason: null };
  } catch (err) {
    return { url: null, reason: `link failed: ${(err as Error)?.message ?? err}` };
  }
}

export async function POST(request: Request) {
  if (!process.env.POS_AUTOMATION_SECRET) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { show_slug, youtube_id } = parsed.data;
  const admin = createAdminClient() as any;

  // Inputs in parallel: the hosts reference + the episode's own frames (or YouTube's).
  const [reference, video] = await Promise.all([loadHostsReference(show_slug), loadVideoFrames(youtube_id, admin)]);
  const frameSource: 'video' | 'youtube' = video ? 'video' : 'youtube';
  const frames: Candidate[] = video ? video.frames : await loadYoutubeFrames(youtube_id);
  const framesFolder = video ? `${showFolderPath(show_slug)}/Thumbnails/frames/${video.basename}` : null;

  if (frames.length === 0) {
    return NextResponse.json(
      buildPickOutput({ picked: null, frameSource, framesConsidered: 0, hostsReferenceUsed: reference !== null, hostsUrl: null, guestUrl: null, framesFolder })
    );
  }

  const picked = await pickFramesWithVision(
    reference,
    frames.map(({ index, bytes }) => ({ index, bytes }))
  );

  let hostsUrl: string | null = null;
  let guestUrl: string | null = null;
  let noteSuffix = '';

  if (video && framesFolder) {
    // Always leave the contact sheet, even on a picker miss — it explains the miss.
    try {
      const sheet = await buildContactSheet(frames.map(({ index, bytes }) => ({ index, bytes })));
      const up = await uploadFile(`${framesFolder}/candidates.jpg`, sheet);
      if (up.status === 'failed') console.warn('[pick-frames] contact sheet upload failed:', up.error);
    } catch (err) {
      console.warn('[pick-frames] contact sheet failed:', (err as Error)?.message ?? err);
    }
    if (picked) {
      // Sequential on purpose: Dropbox rejects concurrent writes in one folder (too_many_write_operations).
      const h = await publishPick(framesFolder, 'hosts', frames.find((f) => f.index === picked.result.hosts_frame));
      const g = await publishPick(framesFolder, 'guest', frames.find((f) => f.index === picked.result.guest_frame));
      hostsUrl = h.url;
      guestUrl = g.url;
      for (const reason of [h.reason, g.reason]) if (reason) noteSuffix += ` (${reason})`;
    }
  } else if (picked) {
    hostsUrl = frames.find((f) => f.index === picked.result.hosts_frame)?.url ?? null;
    guestUrl = frames.find((f) => f.index === picked.result.guest_frame)?.url ?? null;
  }

  return NextResponse.json(
    buildPickOutput({
      picked,
      frameSource,
      framesConsidered: frames.length,
      hostsReferenceUsed: reference !== null,
      hostsUrl,
      guestUrl,
      framesFolder,
      noteSuffix,
    })
  );
}
```

- [ ] **Step 2: Full app verification**

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && npm run typecheck && npx vitest run && npm run lint`
Expected: typecheck clean; all vitest suites pass (including the 10 in `frame-picker.test.ts`); lint clean (fix any `@typescript-eslint/no-explicit-any` complaint on `admin: any` by matching the approve route's existing pattern — an `// eslint-disable-next-line @typescript-eslint/no-explicit-any` if the repo's lint config flags it).

- [ ] **Step 3: Commit + push (app)**

```bash
cd /Users/oceano/oceano-blue-ops/oceano-blue-ops && git add lib/podcasts/frame-picker.ts lib/podcasts/frame-picker.test.ts app/api/automations/podcast/pick-frames/route.ts && git commit -m "feat(podcast): frame picker v2 — frames from the episode video

pick-frames now resolves the episode's Dropbox mp4 from the youtube_id, samples
12 frames via worker-edit /frames, runs the vision picker over them, and writes
hosts.jpg / guest.jpg / a numbered candidates.jpg contact sheet to
<show>/Thumbnails/frames/<basename>/ — returning Dropbox links for Make. Any
failure before the picker degrades to v1 (YouTube's three auto-frames). Response
adds frame_source + frames_folder; route budget 300 s.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin main
```

---

### Task 9: Deploy the worker, deploy the app, patch Make, verify on Natalie

**Files:** none (operations). Do these in order; each depends on the previous.

- [ ] **Step 1: Deploy worker-edit to Fly**

Precondition: `fly auth whoami` prints the account email. If it prints `no access token available`, ask the owner to run `fly auth login` in the terminal panel (opens a browser); do not paste tokens.

Run: `cd /Users/oceano/oceano-blue-ops/oceano-blue-ops/worker-edit && fly deploy --remote-only`
Expected: build succeeds (apt installs ffmpeg), machines updated, ends with `Visit your newly deployed app at https://oceano-edit-engine.fly.dev/`.

- [ ] **Step 2: Smoke-test the worker**

Run: `curl -s https://oceano-edit-engine.fly.dev/health`
Expected: `{"ok":true,"service":"oceano-edit-engine","raw":true}`

Run (auth + validation only; no secret needed to see the 401): `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://oceano-edit-engine.fly.dev/frames -H 'content-type: application/json' -d '{"url":"https://example.com/x.mp4"}'`
Expected: `401`

- [ ] **Step 3: Confirm the Vercel production deploy is READY**

The push in Task 8 triggers it. Check with the Vercel MCP `list_deployments` (project `prj_sddBc3AvFjYs5MCC33qdac58uYjS`, team `team_zgVFpKpYcl6UMIqGDXMqQejC`, limit 1): `state: "READY"`, `githubCommitMessage` starting `feat(podcast): frame picker v2`.

- [ ] **Step 4: Patch the Make scenario's timeout (5918919)**

Via the Make MCP: `scenarios_get 5918919`, take `blueprint`, change module 13's `mapper.timeout` from `"60"` to `"300"`, and in module 11's email `content` insert `<li>Frame source: {{13.data.frame_source}}{{if(13.data.frames_folder; " — candidates + picks saved to Dropbox at " + 13.data.frames_folder; "")}}</li>` right after the existing "Frames picked automatically…" `<li>`. Then `scenarios_update` with the full blueprint JSON string and `scheduling` `{"type":"indefinitely","interval":7200}`. Re-read with `scenarios_get` and confirm module 13 timeout is `"300"`. (The blueprint holds no secrets — both keys come from the MYH Secrets data store.)

- [ ] **Step 5: Live verification on Natalie Lucas (7EoLLmu0b7s)**

1. `scenarios_update` module 1 formula → `AND({YouTube URL}!='', FIND('mindyourhealthjulynatalielucas', LOWER({Raw Filename})) > 0)`.
2. `scenarios_run 5918919` (a "connector not responding" error means the run started — never re-fire).
3. `executions_list 5918919` → confirm a new `EXECUTION_START`.
4. Immediately restore module 1 formula → `AND({Status}='Uploaded (Unlisted)', {YouTube URL}!='', {Thumbnail URL}='')` and confirm via `scenarios_get`.
5. Wait for `EXECUTION_END` status 1. Vercel runtime logs (`get_runtime_logs`, search `pick-frames`) must show `POST /api/automations/podcast/pick-frames 200` with no `[pick-frames] video frames unavailable` warning.
6. Dropbox: list `/Podcasts/mind-your-health/Thumbnails/frames/oceanoblue_mindyourhealthjuly_mindyourhealthjulynatalielucas_v1/` (exact basename = Natalie's raw filename minus `.mp4`, lower-cased) → expect `candidates.jpg` and, if picked, `hosts.jpg` / `guest.jpg`. View `candidates.jpg`.
7. Fetch `https://i.ytimg.com/vi/7EoLLmu0b7s/maxresdefault.jpg` (compare its byte size against every previously seen size — the CDN flaps between cached versions for minutes) and view the thumbnail. The success email should read `Frame source: video`.

**Caveat for the reviewer:** Natalie's July episode was ingested before the folder move; if her `metadata.dropbox_path` still points at the old `RENDERS` location and the file was moved, step 5 logs `video frames unavailable` and the run correctly falls back to v1 — that is the designed behaviour, not a failure. In that case verify on an August episode instead (retarget with `FIND('mindyourhealthaugust', LOWER({Raw Filename}))` and `maxRecords` `"1"`), and restore the formula the same way.

- [ ] **Step 6: Record the outcome**

Append to the memory file `/Users/oceano/.claude/projects/-Users-oceano-oceano-blue-ops/memory/mind-your-health-podcast-pipeline.md`: v2 shipped (commit SHAs, Fly deploy time), the `frames/<basename>/` folder convention, the Make timeout now 300, and which episode verified it with `frame_source: video`.
