#!/usr/bin/env python3
"""
Oceano Blue — office-Mac edit daemon.

Polls the Ops edit-job queue, pulls footage, drives DaVinci Resolve to cut and
render the reel/long-form video, uploads the render, and marks the job done
(which moves the order to the human review gate — never auto-delivered).

Usage:
  python3 daemon.py                 # run the poll loop
  python3 daemon.py --once          # one poll cycle, then exit
  python3 daemon.py --plan <id>     # print the cut plan for one job (no render)

Env: OPS_BASE_URL, OCEANO_WORKER_KEY, WORK_DIR, POLL_SECONDS, DRY_RUN. See README.
"""
from __future__ import annotations
import os
import sys
import time
import traceback

from config import Config
from api import OpsClient
from cutplan import plan_timeline


def _download_footage(client: OpsClient, ctx: dict, work_dir: str) -> dict:
    """Download every clip; return {filename: local_path}."""
    paths = {}
    for clip in ctx.get("footage", []):
        url = clip.get("url")
        name = clip.get("filename")
        if not url or not name:
            continue
        dest = os.path.join(work_dir, "src", name)
        print(f"  ↓ {name}")
        client.download(url, dest)
        paths[name] = dest
    return paths


def _preview_plan(ctx: dict) -> list:
    """Plan ordering from the edit plan alone (no transcription) — diagnostic."""
    entries = (ctx.get("edit_plan") or {}).get("timeline") or []
    return plan_timeline([
        {"source": e.get("source"), "cues": [], "trim": e.get("trim", "auto")}
        for e in entries
    ])


def process_job(client: OpsClient, job: dict) -> None:
    job_id = job["id"]
    print(f"\n▶ edit job {job_id} (order {job.get('order_id')})")
    ctx = client.context(job_id)
    work_dir = os.path.join(Config.WORK_DIR, job_id)

    if Config.DRY_RUN:
        print("  DRY_RUN — plan preview (no transcription, no render):")
        for p in _preview_plan(ctx):
            print(f"    • {p['source']}  [{p['in_s']}–{p['out_s']}s]"
                  + (f"  ⚠ {p['warnings']}" if p["warnings"] else ""))
        print("  DRY_RUN — not claiming/rendering/completing.")
        return

    try:
        footage = _download_footage(client, ctx, work_dir)
        if not footage:
            raise RuntimeError("no footage to edit")

        # Heavy import deferred so DRY_RUN / --plan never need Resolve installed.
        from resolve_runner import build_and_render
        out_path, duration = build_and_render(
            ctx, footage, os.path.join(work_dir, "out"),
            render_format=Config.RENDER_FORMAT, render_codec=Config.RENDER_CODEC,
        )
        filename = os.path.basename(out_path)
        size = os.path.getsize(out_path)
        print(f"  ✓ rendered {filename} ({size/1e6:.1f} MB, {duration:.1f}s)")

        up = client.upload_url(job_id, filename)
        client.put_signed(up["signed_url"], out_path,
                          content_type="video/mp4" if filename.endswith(".mp4") else "video/quicktime")
        client.complete(
            job_id, status="done",
            result_path=up["path"], result_filename=filename,
            result_byte_size=size, result_duration_seconds=round(duration, 2),
        )
        print("  ✓ completed → order moved to review")
    except Exception as e:
        print(f"  ✗ failed: {e}")
        traceback.print_exc()
        try:
            client.complete(job_id, status="failed", error=str(e)[:3900])
        except Exception:
            pass


def poll_once(client: OpsClient) -> int:
    jobs = client.claim(max_jobs=1)
    for job in jobs:
        process_job(client, job)
    return len(jobs)


def main():
    args = sys.argv[1:]
    Config.validate()
    client = OpsClient()

    if args and args[0] == "--plan":
        if len(args) < 2:
            raise SystemExit("usage: daemon.py --plan <edit_job_id>")
        ctx = client.context(args[1])
        for p in _preview_plan(ctx):
            print(f"• {p['source']}  [{p['in_s']}–{p['out_s']}s]"
                  + (f"  ⚠ {p['warnings']}" if p["warnings"] else ""))
        return

    once = "--once" in args
    print(f"oceano edit daemon → {Config.OPS_BASE_URL}  (dry_run={Config.DRY_RUN})")
    while True:
        try:
            n = poll_once(client)
            if not n:
                print(".", end="", flush=True)
        except Exception as e:
            print(f"\npoll error: {e}")
        if once:
            break
        time.sleep(Config.POLL_SECONDS)


if __name__ == "__main__":
    main()
