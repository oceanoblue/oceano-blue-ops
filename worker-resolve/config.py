"""Daemon configuration from environment variables."""
import os


class Config:
    # Base URL of the Oceano Blue Ops app (the Vercel deployment), e.g.
    # https://ops.oceanoblue.net  — no trailing slash.
    OPS_BASE_URL = os.environ.get("OPS_BASE_URL", "").rstrip("/")
    # Per-worker Bearer key from `POST /api/worker/register` (starts with obw_).
    WORKER_KEY = os.environ.get("OCEANO_WORKER_KEY", "")
    # Scratch dir for downloaded footage + renders.
    WORK_DIR = os.environ.get("WORK_DIR", os.path.expanduser("~/oceano-edits"))
    # Seconds between polls when idle.
    POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "20"))
    # Render preset / format.
    RENDER_FORMAT = os.environ.get("RENDER_FORMAT", "mp4")
    RENDER_CODEC = os.environ.get("RENDER_CODEC", "H264")
    # Dry run: plan only, never touch Resolve or upload. For local testing.
    DRY_RUN = os.environ.get("DRY_RUN", "0") in ("1", "true", "yes")

    @classmethod
    def validate(cls):
        missing = []
        if not cls.OPS_BASE_URL:
            missing.append("OPS_BASE_URL")
        if not cls.WORKER_KEY and not cls.DRY_RUN:
            missing.append("OCEANO_WORKER_KEY")
        if missing:
            raise SystemExit(f"Missing required env: {', '.join(missing)}")
