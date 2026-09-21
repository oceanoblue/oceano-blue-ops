# Generative enhancement v2

The manual photo editor and automatic enhancement now use GPT Image 2.5 Sunburst by default, with a versioned Bright Listing / Strong Windows recipe. Natural, Editorial and Flash Blend Look are distinct photographic styles. Auto/mixed, Interior and Exterior presets can be saved independently; automatic jobs use the Auto/mixed preset, while scene selections use their saved defaults.

The generated output remains the finished image. Global LUT substitution was removed. The original/current source remains intact, follow-up edits use the current version, and every new generated or adjusted output starts unselected for review. Draft failure leaves the prior successful version unchanged.

Window recovery accepts a darker, exposure-tagged frame only from the photo's producing merge lineage and order. Missing references do not block initial enhancement, but instructions preserve clipped views; a standalone Window tool fails before spending if no reference exists. This release resolves references from stored decodable camera JPEGs/previews. Dropbox-only brackets and RAW-only references without a decodable preview are not yet supported by that resolver. No semantic window segmentation or fidelity guarantee is claimed.

The adapter preserves source proportions within a 2048-pixel long edge, validates returned proportions/MIME, disables SDK retries, and records source hashes, token usage, requested/actual dimensions, quality and model. The displayed/stored cost remains an estimate; provider token usage is preserved for accounting. The reaper does not repeat an interrupted paid request automatically.

Tone adjustment preview/save both start from the visible version, omit automatic white-balance changes, and retain the full adjustment recipe. Zero sliders no longer trigger an unsolicited preview. Highlight adjustment now applies a luminance-weighted curve rather than a canceling gamma operation. Basic correction uses the saved tonal settings and does not silently fall back to generative editing.

## Release order

1. Apply `20260921180000_generative_finish_defaults.sql` and `20260921180100_enhancement_paid_attempts.sql`.
2. Deploy the application after CI passes. No worker deployment is required by this change.
3. Verify settings, scene presets, draft review and a Sunburst request using a test order. Preserve existing accepted photos and delivery selections.

## Validation

Local: 511 tests pass, including request construction, selected-version adjustment, style snapshots, same-capture reference isolation, ambiguous paid attempts, draft status, and end-to-end runner persistence with a mocked provider. Typecheck passes. Local production builds could not complete due compiler port/network restrictions; CI is the production build gate.

These tests establish application behavior, not image-model fidelity or parity with commercial editors. A multi-property, matched-original benchmark remains necessary before making that claim. Existing Python worker quality/precision limits are unchanged. Release smoke results are recorded separately after deployment.
