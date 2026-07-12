# Workflow: RE Photo Production — Fotello Edit Loop (Interim)

Date: 2026-07-12
Status: **Current operating standard** until the internal edit engine (worker-edit) reaches acceptable quality.
Owner: Gustavo
Supersedes: nothing — narrows REAL_ESTATE_PHOTO_PRODUCTION_V3.md §Next-Required-Work item 4 from "provider comparison" to "Fotello as sole interim provider."

## Purpose

Ship client-ready real estate photos with Fotello's editing quality while the Production OS keeps custody of everything else: booking, intake, bracket grouping, review, QC, delivery, and revision tracking. The platform is the system of record; Fotello is a processing station inside it.

## Constraints (verified 2026-07-12, fotello.co/pricing)

- API access is **Partner plan only** (custom pricing, starts at 50 listings/month). Below that volume the loop is manual through their web app.
- Plans: Essential $16/listing (50 photos), Ultimate $18/listing (75 photos, twilight + virtual staging + white-label). Human revisions within ~6 h.
- Auto-bracketing: upload raw brackets, Fotello merges. Output: MLS web (2560 px) + print (4096 px) + originals on paid plans.

## Trigger

A shoot's bracket sets are grouped and reviewed in Photo Production (assets → bracket sets confirmed correct).

## Roles

- **Photographer** (Gustavo/team): shoots, ingests, groups brackets.
- **Producer** (Gustavo): sends to Fotello, imports results, runs internal review, requests revisions.
- **Client**: reviews via gallery, downloads, requests revisions.

## Process

1. **Ingest & group** (existing) — assets indexed, bracket sets built and confirmed in Photo Production.
2. **Export bundle** — one click on the order: platform zips the confirmed bracket sets, sequence-named (`{listing-slug}_{setNN}_{frame}.{ext}`), and records file count + manifest. Status → `Export ready`.
3. **Upload to Fotello** — producer creates the listing in Fotello's web app, uploads the bundle, saves the Fotello listing URL back onto the order. Status → `Sent to Fotello`. Timestamp recorded.
4. **Import results** — when Fotello finishes (minutes for AI pass), producer downloads results and drops them on the order's import zone. Platform matches outputs to bracket sets by filename manifest, attaches them as processed outputs. Status → `Edits returned`.
5. **Internal review** (existing review flow) — accept / reject / needs-revision per photo, side-by-side with bracket base.
   - Needs revision → producer files it in Fotello's revision dialog (free, human-edited, ~6 h). Status → `Revisions at Fotello`. Loop to step 4.
   - All accepted → status → `Approved for delivery`.
6. **Deliver** (existing) — promote to delivery versions, token-protected gallery, client notification. Status → `Delivered`.

## Statuses (order-level, meaningful names)

`Brackets grouped` → `Export ready` → `Sent to Fotello` → `Edits returned` → `Internal review` → `Revisions at Fotello` → `Approved for delivery` → `Delivered`

## Data stored

On the order: `edit_provider` ('fotello' | 'internal'), `external_listing_url`, `sent_at`, `returned_at`, export manifest (filenames + set mapping), per-photo revision notes, cost per listing (from plan rate — configurable, never hardcoded).

## Automations

- **SLA timer**: if `Sent to Fotello` > 12 h without import, notify producer. Failure mode: timer misfires harmlessly (notification only, no state change). Manual override: dismiss.
- **Filename matcher on import**: exact-match against manifest; unmatched files land in a "needs manual match" tray — never silently dropped or guessed.
- No automation sends anything to the client without the existing review approval step.

## Exceptions & failure handling

- **Missing/extra files on import** → manual-match tray + count mismatch warning; order cannot advance to `Internal review` until reconciled.
- **Fotello quality miss after 2 revision rounds** → escalate: process that set through the internal engine or hand-edit; note on order for engine training priorities.
- **Fotello outage/delay** → internal engine is the documented fallback path (one click, same review flow).

## Completion criteria

All photos in the order accepted, delivered via gallery, `Delivered` status with delivery timestamp.

## Metrics

- Hours: shoot → sent, sent → returned, returned → delivered (the client-visible promise).
- Revision rate per listing (target < 15% of photos).
- Cost per listing vs. photos delivered (margin guard).

## Decision gates (review monthly)

1. **Volume gate**: at ≥ 50 listings/month, price Fotello Partner (API) — automating steps 3–4 removes the only manual handoff.
2. **Engine gate**: when worker-edit QC pass rate ≥ Fotello's on a 3-listing A/B, flip `edit_provider` default to 'internal'. The (original, output) training-pairs capture already in the schema supports this comparison. **Open question (do not act without answering): whether Fotello's ToS permits using their returned edits as training/tuning references for the internal engine.**

## Related workflows

- Booking → shoot (upstream), Client gallery delivery (downstream), Podcast engine (parallel, Make.com), REAL_ESTATE_PHOTO_PRODUCTION_V3 (canonical flow this plugs into).

## Platform touchpoints to build (implementation order)

1. `edit_provider` + external-loop fields on orders (migration).
2. "Send to Fotello" panel on the order page: export bundle + manifest + URL field + status advance.
3. Import dropzone with manifest matcher + manual-match tray.
4. SLA notification (existing notifications infra).

Steps 1–3 are one cohesive feature; step 4 can follow. Everything else in the loop already exists.
