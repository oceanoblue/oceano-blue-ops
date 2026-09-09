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
from fastapi.testclient import TestClient

import frames
import server


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


def test_probe_error_never_embeds_url_query_string():
    async def fake_run(args, timeout):
        return 1, b"", b"https://dl.dropboxusercontent.com/x.mp4?rlkey=SECRETTOKEN&dl=1: Server returned 403 Forbidden"

    with pytest.raises(frames.FrameError) as ei:
        asyncio.run(frames.extract_frames("https://x/y.mp4", count=3, runner=fake_run))
    msg = str(ei.value)
    assert msg.startswith("probe_failed")
    assert "SECRETTOKEN" not in msg
    assert "403" in msg


def test_missing_binary_is_a_probe_error():
    async def fake_run(args, timeout):
        raise FileNotFoundError("ffprobe")

    with pytest.raises(frames.FrameError, match="probe_failed: FileNotFoundError"):
        asyncio.run(frames.extract_frames("https://x/y.mp4", count=3, runner=fake_run))


def test_runner_exception_drops_only_that_frame():
    ts = frames.frame_timestamps(120.0, 3)
    jpeg = _jpeg()

    async def fake_run(args, timeout):
        if args[0] == "ffprobe":
            return 0, json.dumps({"format": {"duration": "120.0"}}).encode(), b""
        if abs(float(args[args.index("-ss") + 1]) - ts[0]) < 1e-6:
            raise RuntimeError("boom")
        return 0, jpeg, b""

    out = asyncio.run(frames.extract_frames("https://x/y.mp4", count=3, runner=fake_run))
    assert [f["index"] for f in out["frames"]] == [2, 3]


def test_default_runner_is_looked_up_at_call_time(monkeypatch):
    jpeg = _jpeg()

    async def fake_run(args, timeout):
        if args[0] == "ffprobe":
            return 0, json.dumps({"format": {"duration": "30"}}).encode(), b""
        return 0, jpeg, b""

    monkeypatch.setattr(frames, "run_subprocess", fake_run)
    out = asyncio.run(frames.extract_frames("https://x/y.mp4", count=2))  # runner=None
    assert [f["index"] for f in out["frames"]] == [1, 2]


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
