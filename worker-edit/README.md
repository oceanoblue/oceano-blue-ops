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
| `window_pull` | bool (default false) | **fuse mode:** recover blown windows from the darkest bracket |
| `straighten` | bool (default false) | de-skew + bounded keystone so verticals are plumb |
| `keystone` | bool (default true) | whether `straighten` also applies the keystone warp |
| `sky_mode` | `keep` \| `replace` (default `keep`) | replace blown sky (no-op for `sober`) |

Header `x-edit-secret` must match `EDIT_WORKER_SECRET`. Returns `image/jpeg`.

- **fuse**: align (best-effort) → Mertens multi-scale exposure fusion (overshoot
  renormalized, not clipped — keeps window-edge highlight separation) →
  [window pull] → [straighten] → resize.
- **grade** (`grade(img, style)`, **v6 float core**): [straighten] → lens correction →
  light denoise → *float32 section, ONE quantization at the end*: auto white balance
  (tint-aware, unclipped) → (`sober` only: `shadow_lift()`, edge-aware room-scale
  dynamic-range compression, halo-free, computed on a proxy) → auto-exposure
  (median-based; ceiling sits ABOVE white in float — over-range survives) → tone
  curve (black point + gentle de-contrast + airy gamma; `sober` adds an
  over-range-aware highlight shoulder that brings pushed near-whites back UNDER
  255 with separation intact) → gentle saturation → edge-aware sharpen →
  quantize → (`default` only: sky soften) → [sky replace]. `style` is `default`
  (unused by profiles) or `sober` (all four production profiles). See
  `../docs/HANDOFF-photo-quality.md` for the live grade parameters and the tuning loop.

### Real-estate enhancements (P1–P4, opt-in)

Modeled on what AutoHDR/Imagen/Autoenhance do. All **off by default** so existing
behaviour is unchanged; enable per-profile from the app layer after validating on
real renders (this is the on-Mac step — CI can't render photos).

- **P1 window pull** (`window_pull.py`): in fuse mode, detect blown window regions and
  feather-blend the *same* pixels from the darkest bracket back in — recovers the exterior
  view without inventing anything. Bracket-based only.
- **P2 vertical correction** (`geometry.py`): detect strong verticals, de-skew (rotation)
  and apply a bounded keystone warp so walls read plumb. Hard-clamped; crops back to size.
- **P3 segmentation** (`masks.py`): window/sky masks driving P1/P4. Classical (bright+flat
  for windows, top-anchored blue/blown for sky) today, with a **pluggable seam** for a
  learned ONNX model (`WINDOW_SEG_MODEL` / `SKY_SEG_MODEL`) — the "custom NN" the commercial
  tools use — to drop in later without changing callers.
- **P4 sky replacement** (`sky.py`): profile-gated. `default`/luxury composite a graded
  (or supplied) sky into the blown sky region; `sober` (architectural/interior) is a
  deliberate no-op to stay faithful.

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
