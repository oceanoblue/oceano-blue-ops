---
name: grade-tune
description: Discipline for photo-grade / tone / white-balance / fusion tuning changes in worker-edit (and any future engine). Use whenever the task is "the photos look too dark / too warm / blown / muddy" or any comparison against AutoHDR/Fotello. Exists because the grade was re-tuned ~20 times across three engine rewrites before converging.
---

# Grade tuning loop

History: v1→v6 in seven days, white balance fixed three separate times, two
versions handed off unverified. The loop converged only when changes were
validated against real renders. These rules are the distilled fix.

## Rules

1. **Read the current state first**: `docs/HANDOFF-photo-quality.md` holds the
   live parameter set, the version history, and what is/isn't render-confirmed.
   If the latest version is unverified, STOP — get the owner's render verdict
   before changing anything, or you are tuning against an unknown baseline.
2. **Reproduce before fixing**: state, in numbers, what is wrong with the
   current render (mean luminance, % pixels ≥250, where halos appear). If the
   complaint is only adjectives ("muddy"), ask for the test photo verdict in
   terms of the target look first.
3. **One conceptual change per PR.** Gamma, exposure target, and gain clamp
   moving together is how v3 blew the windows.
4. **Run the invariant tests** (`cd worker-edit && pytest -q`) — the no-halo
   edge test and dim-room+bright-window end-to-end exist precisely because
   eyeballing missed these regressions.
5. **The PR is done only at render confirmation**, not at merge. End with the
   deploy hand-off (see the deploy-worker-edit skill) and wait for the owner's
   kitchen-photo verdict before opening the next tuning PR.

## Target look (stable definition — do not re-derive)

Bright, airy, luminous, accurate. AutoHDR-style "flambient". "Not HDR-pushed"
means no gritty halos or over-contrast — it does NOT mean darker. Windows hold
detail; rooms read bright. RAW never routes to generative providers.

## If the loop stalls again

Two failed rounds on the same complaint = stop tuning constants and propose a
structural check instead (this is how v6's float-core rebuild finally ended the
v1–v5 ping-pong: 8-bit clipping made room-exposure and window-hold fight over
the same bits). Also consider building the golden-render harness proposed in
`docs/SESSION_FRICTION_AUDIT.md` so this becomes measurable.
