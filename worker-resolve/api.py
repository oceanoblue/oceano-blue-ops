"""
Thin client for the Oceano Blue Ops edit-job worker API.

All calls carry the per-worker Bearer key. The server re-derives ownership and
issues short-lived signed URLs — no Supabase service-role key ever lives here.
"""
from __future__ import annotations
import os
from typing import Optional
import requests

from config import Config


class OpsClient:
    def __init__(self, base_url: str = None, key: str = None):
        self.base = (base_url or Config.OPS_BASE_URL).rstrip("/")
        self.key = key or Config.WORKER_KEY
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"Bearer {self.key}"})

    # ── queue ────────────────────────────────────────────────────────────
    def claim(self, max_jobs: int = 1) -> list:
        r = self.s.post(f"{self.base}/api/worker/edit/claim", json={"max": max_jobs}, timeout=30)
        r.raise_for_status()
        return r.json().get("jobs", [])

    def context(self, edit_job_id: str) -> dict:
        r = self.s.get(
            f"{self.base}/api/worker/edit/context",
            params={"edit_job_id": edit_job_id},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    def upload_url(self, edit_job_id: str, filename: str) -> dict:
        r = self.s.post(
            f"{self.base}/api/worker/edit/upload-url",
            json={"edit_job_id": edit_job_id, "filename": filename},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    def complete(self, edit_job_id: str, **fields) -> dict:
        payload = {"edit_job_id": edit_job_id, **fields}
        r = self.s.post(f"{self.base}/api/worker/edit/complete", json=payload, timeout=60)
        r.raise_for_status()
        return r.json()

    # ── transfers ────────────────────────────────────────────────────────
    def download(self, url: str, dest_path: str) -> str:
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        with self.s.get(url, stream=True, timeout=600) as r:
            r.raise_for_status()
            with open(dest_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    if chunk:
                        f.write(chunk)
        return dest_path

    def put_signed(self, signed_url: str, file_path: str, content_type: str = "video/mp4") -> None:
        """Upload a rendered file to a Supabase signed upload URL."""
        with open(file_path, "rb") as f:
            r = requests.put(
                signed_url,
                data=f,
                headers={"Content-Type": content_type, "x-upsert": "true"},
                timeout=1800,
            )
        r.raise_for_status()
