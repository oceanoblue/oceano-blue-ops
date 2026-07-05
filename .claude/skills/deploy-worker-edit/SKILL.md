---
name: deploy-worker-edit
description: Pre-ship checklist for any change under worker-edit/ (the Fly "oceano-edit-engine" Python photo pipeline). Use whenever a PR touches worker-edit/, before merging it. Catches the Dockerfile COPY trap that once crash-looped production for a day, and produces the owner deploy hand-off.
---

# worker-edit ship checklist

worker-edit deploys are MANUAL (`fly deploy`) and the sandbox can neither
deploy nor reach `*.fly.dev`. A merged PR is therefore not a shipped PR. Run
this checklist before merge, and end with the owner hand-off block.

## 1. Dockerfile COPY audit (the trap)

The Dockerfile copies Python files BY NAME. A new module that isn't listed
crash-loops Fly with ModuleNotFoundError on the next deploy.

```bash
cd worker-edit
# every top-level import in the service must exist in the Dockerfile COPY line
grep -E "^(from|import) " server.py *.py | grep -vE "^(test_)" | sort -u
grep "^COPY" Dockerfile
```

Every local module imported (directly or transitively) by `server.py` must
appear in a COPY line. Same for `requirements.txt` if you added a dependency.

## 2. Tests

```bash
cd worker-edit && pip install -r requirements.txt pytest && pytest -q
```

All tests must pass — they run in CI too, but run them here first; they encode
the grade invariants (no-halo, dim-room+bright-window, over-range separation).

## 3. Grade changes only: verification gate

If the diff touches grade/tone/fusion parameters, the PR is not done at merge:
it needs a real-render confirmation from the owner before ANY further tuning
PR. State this in the PR body. Never stack a new tune on an unverified one.

## 4. Owner hand-off block (paste into the PR body / final message)

```
Deploy (owner):
  cd worker-edit && git pull && fly deploy
Verify:
  curl https://oceano-edit-engine.fly.dev/health
  # expect {"ok":true,...,"raw":true} — missing "raw" or stale fields = old build
<if grade change>: run the kitchen test photo and report the render before we tune further.
```
