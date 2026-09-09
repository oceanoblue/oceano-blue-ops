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
import re
from typing import Awaitable, Callable, List, Optional, Tuple

RunResult = Tuple[int, bytes, bytes]  # returncode, stdout, stderr
Runner = Callable[[List[str], float], Awaitable[RunResult]]

PROBE_TIMEOUT = 30.0
FRAME_TIMEOUT = 45.0
TOTAL_TIMEOUT = 150.0
MAX_PARALLEL = 4
MIN_FRAME_BYTES = 200  # anything smaller is not a real JPEG frame

_QUERY_RE = re.compile(r"\?[^\s'\"]*")


def scrub(text: str, limit: int = 200) -> str:
    """Error text safe to log: query strings (signed-URL tokens) removed, truncated."""
    return _QUERY_RE.sub("?…", text)[:limit]


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
    except OSError as e:
        # covers FileNotFoundError (ffmpeg/ffprobe missing from PATH) and similar
        return (-1, b"", scrub(f"{type(e).__name__}: {e}").encode())


async def probe_duration(url: str, runner: Optional[Runner] = None) -> float:
    args = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", url]
    rc, out, err = await _run(args, PROBE_TIMEOUT, runner)
    if rc != 0:
        raise FrameError(f"probe_failed: {scrub(err.decode(errors='replace'))}")
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
        try:
            async with sem:
                rc, out, _err = await _run(args, FRAME_TIMEOUT, runner)
        except Exception:
            # a runner bug drops this one frame; never escapes gather and
            # orphans sibling ffmpeg processes. CancelledError is a
            # BaseException, so it still propagates untouched.
            return None
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
