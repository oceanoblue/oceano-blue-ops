/**
 * External edit batches (Fotello loop) — manifest types + filename matching.
 *
 * A batch's manifest records what was exported (one entry per photo, with the
 * sequence-named file that went into the zip). Returned files are matched back
 * to entries by filename STEM, because external editors rename outputs in
 * mostly-predictable ways (append "-edited", change extension, add copy
 * suffixes). Matching is deliberately conservative: an ambiguous file goes to
 * the manual-match tray instead of guessing.
 */

export type ManifestEntry = {
  photo_id: string;
  export_name: string;
  /** Set on import: the original photo the returned file was attached to. */
  matched_photo_id?: string;
  /** Set on import: the new `processed` photo row created for the returned file. */
  imported_photo_id?: string;
  imported_at?: string;
};

export type BatchStatus = 'export_ready' | 'sent' | 'returned' | 'closed';

/** Reduce a filename to a comparable stem: no extension, no case, no
 *  separators, common editor suffixes stripped. */
export function normalizeStem(filename: string): string {
  let stem = filename.replace(/\.[^.]+$/, '').toLowerCase();
  stem = stem.replace(/\s*\(\d+\)\s*$/, ''); // "name (1)" copy markers
  stem = stem.replace(/[-_ .]*(edited|edit|enhanced|final|hdr|retouched|copy)$/i, '');
  return stem.replace(/[^a-z0-9]/g, '');
}

/** Build the zip entry name for one photo: `ob{order}_{NNN}_{original-stem}.{ext}`.
 *  The order prefix keeps names unique across listings if zips ever mix. */
export function buildExportName(orderNumber: number, seq: number, filename: string): string {
  const dot = filename.lastIndexOf('.');
  const stem = (dot > 0 ? filename.slice(0, dot) : filename)
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : 'jpg';
  return `ob${orderNumber}_${String(seq).padStart(3, '0')}_${stem}.${ext}`;
}

export type MatchResult =
  | { kind: 'match'; entry: ManifestEntry }
  | { kind: 'ambiguous'; candidates: ManifestEntry[] }
  | { kind: 'none' };

/** Match a returned file against the manifest. Exact stem equality wins;
 *  otherwise a unique containment (editor prefixed/suffixed the name) counts.
 *  Multiple candidates → ambiguous → manual tray. */
export function matchReturnedFile(filename: string, manifest: ManifestEntry[]): MatchResult {
  const stem = normalizeStem(filename);
  if (!stem) return { kind: 'none' };

  const exact = manifest.filter((e) => normalizeStem(e.export_name) === stem);
  if (exact.length === 1) return { kind: 'match', entry: exact[0] };
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact };

  const partial = manifest.filter((e) => {
    const es = normalizeStem(e.export_name);
    return es.length >= 6 && stem.length >= 6 && (stem.includes(es) || es.includes(stem));
  });
  if (partial.length === 1) return { kind: 'match', entry: partial[0] };
  if (partial.length > 1) return { kind: 'ambiguous', candidates: partial };
  return { kind: 'none' };
}
