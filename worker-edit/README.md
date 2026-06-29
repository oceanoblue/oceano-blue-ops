# Oceano Edit Engine

Deterministic real-estate photo pipeline (Python / OpenCV) — the faithful core
of the editing rebuild. It only adjusts real pixels; it never synthesizes
content. Generative edits (sky / declutter / staging) are handled separately as
masked, opt-in operations.

## Operations (`POST /edit`, multipart)

| field | values | meaning |
|-------|--------|---------|
| `files` | 1..n images | bracket frames (fuse) or one frame (grade) |
| `mode` | `fuse` \| `grade` | `fuse` = Mertens exposure fusion; `grade` = finishing grade |
| `target_long_edge` | int (default 4000) | output long edge |
| `quality` | 1..100 (default 90) | JPEG quality |

Header `x-edit-secret` must match `EDIT_WORKER_SECRET`. Returns `image/jpeg`.

- **fuse**: align (best-effort) → Mertens multi-scale exposure fusion → resize. No grade.
- **grade** (`grade(img, style)`): lens correction → auto white balance (tint-aware) →
  auto-exposure (median-based) → light denoise → tone curve (black point + gentle
  de-contrast + airy gamma; `sober` adds a highlight roll-off) → gentle saturation →
  (`default` only: sky soften) → edge-aware sharpen. `style` is `default`
  (MLS / luxury) or `sober` (architectural / interior). See
  `../docs/HANDOFF-photo-quality.md` for the live grade parameters and the tuning loop.

## Deploy (Fly.io)

```sh
cd worker-edit
fly launch --copy-config --no-deploy      # first time only; app name: oceano-edit-engine
fly secrets set EDIT_WORKER_SECRET=$(openssl rand -hex 32)
fly deploy
```

Then in **Vercel** env vars:

```
EDIT_ENGINE_URL    = https://oceano-edit-engine.fly.dev
EDIT_WORKER_SECRET = <same value you set on Fly>
```

Until both are set, the app falls back to the legacy in-process pipeline, so
nothing breaks before the engine is live.

## Local test

```sh
pip install -r requirements.txt
EDIT_WORKER_SECRET=test uvicorn server:app --port 8080
curl -s -X POST http://localhost:8080/edit \
  -H "x-edit-secret: test" \
  -F mode=fuse -F files=@dark.jpg -F files=@mid.jpg -F files=@bright.jpg \
  -o fused.jpg
```

## Grade-math tests

`test_server.py` locks in the mathematical invariants of the grade functions
(curve monotonicity, white preservation, exposure target + clamps, tint-aware
WB + sky exclusion, etc.). They're pure NumPy/OpenCV — no Fly, no renders — so
they make the parameter-tuning loop regression-safe. They run in CI
(`edit-engine` job) and locally:

```sh
pip install -r requirements.txt pytest
pytest -q
```
