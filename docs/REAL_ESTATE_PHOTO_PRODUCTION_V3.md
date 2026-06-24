# Real Estate Photo Production v3

Date: 2026-06-23

## Decision

The real estate photo system should be treated as a production workflow, not a rescue tool and not a generic AI playground.

The canonical flow is:

1. **Sources** — local/NAS files are indexed as `assets`.
2. **Bracket sets** — source photos are grouped into real HDR sets, usually 3/5/7 frames per final image.
3. **Process** — each reviewed bracket set produces exactly one processed output; active singles produce one enhanced output each.
4. **Review** — processed outputs are reviewed as deliverable candidates.
5. **QC / delivery** — QC checks the source organization and final outputs before delivery.

## What Was Wrong

- The UI called the workflow “Photo Rescue,” which made it feel like a side tool instead of the main production line.
- “Merge” meant both manual grouping and HDR processing depending on context.
- Orders and Photo Rescue used different storage models, which made it unclear where a real estate shoot should be tested.
- Users could select two 3-shot brackets and accidentally combine them into one 6-shot group.

## Current Implementation Direction

- Keep the existing `/photo-rescue` routes for compatibility, but label the product as **Photo Production**.
- Use Photo Production for the new local-worker `assets / asset_groups / worker_tasks` pipeline.
- Keep Orders for the legacy/customer delivery flow until processed assets can be promoted into delivery versions.
- Make bracket grouping explicit:
  - **One bracket** creates one bracket set from the selected files.
  - **3-shot brackets** chunks selected singles into separate 3-frame sets.
  - **Combine groups** is only for correcting a group that was accidentally split.
- Queue processing only after bracket sets are correct.

## Next Required Work

1. Add a processed-output review state: accept/reject/needs-revision.
2. Add side-by-side original bracket base vs processed output.
3. Promote approved processed `assets` into `delivery_versions`.
4. Add provider comparison mode: internal local worker vs Autoenhance vs Fotello when API access is available.
5. Replace the Sharp fallback merge in `worker-local` with the OpenCV edit engine or call `worker-edit` from the local worker.
