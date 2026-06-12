/**
 * A "merge passthrough" is the deterministic HDR-merge output (Oceano Enhance,
 * is_hdr) — an intermediate, NOT a finished deliverable. The Review grid hides
 * these; delivery must too, or the un-enhanced merges leak into the client
 * gallery alongside the AI-enhanced finals.
 */
export function isMergePassthrough(p: {
  is_hdr?: boolean | null;
  ai_provider?: string | null;
}): boolean {
  return p.is_hdr === true && p.ai_provider === 'oceano-enhance';
}

/** Photos that belong in a client delivery: selected, non-RAW, finished. */
export function isDeliverable(p: {
  is_hdr?: boolean | null;
  ai_provider?: string | null;
}): boolean {
  return !isMergePassthrough(p);
}
