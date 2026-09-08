"""HTTP contract regressions. Run with: pip install pytest httpx && pytest -q."""

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

import server


@pytest.mark.parametrize("mode", ["grade", "fuse", "look"])
@pytest.mark.parametrize("straighten", ["false", "true"])
def test_edit_straighten_form_returns_jpeg(monkeypatch, mode, straighten):
    """The public boolean must not shadow the final leveling helper in any mode."""
    monkeypatch.setattr(server, "SECRET", "test-edit-secret")
    # Isolate the endpoint contract from image-dependent tilt detection while
    # checking both the optional geometry pass and the historical final pass.
    geometry_calls = []
    leveling_calls = []

    def geometry(img, *, apply_keystone):
        geometry_calls.append(apply_keystone)
        return img

    def level(img):
        leveling_calls.append(True)
        return img

    monkeypatch.setattr(server, "straighten_verticals", geometry)
    monkeypatch.setattr(server, "straighten", level)
    monkeypatch.setattr(server, "LENS_K1", 0.0)
    img = np.full((48, 64, 3), 128, dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", img)
    assert ok
    files = [("files", ("source.jpg", encoded.tobytes(), "image/jpeg"))]
    if mode == "look":
        files.append(("files", ("reference.jpg", encoded.tobytes(), "image/jpeg")))

    with TestClient(server.app) as client:
        response = client.post(
            "/edit",
            headers={"x-edit-secret": "test-edit-secret"},
            data={"mode": mode, "straighten": straighten, "style": "sober"},
            files=files,
        )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    decoded = cv2.imdecode(np.frombuffer(response.content, np.uint8), cv2.IMREAD_COLOR)
    assert decoded is not None
    assert decoded.shape == img.shape
    assert leveling_calls == [True]
    assert geometry_calls == ([True] if straighten == "true" and mode != "look" else [])
