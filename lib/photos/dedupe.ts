/**
 * Near-duplicate detection for listing photos.
 *
 * Photographers routinely fire several frames of the same composition (same
 * room, same angle, seconds apart). After enhancement those become near-
 * identical deliverables. This module clusters them by perceptual hash and,
 * within each cluster, identifies the single sharpest frame to keep — so the
 * client gallery shows one clean pick per shot instead of three almost-the-same.
 *
 * Pure + deterministic (no sharp, no I/O) so it unit-tests cleanly. The actual
 * fingerprints (perceptual hash + sharpness) are produced by
 * lib/photos/fingerprint.ts and fed in here.
 */

export interface Fingerprinted {
  id: string;
  /** 64-bit perceptual (dHash) value. */
  hash: bigint;
  /** Higher = sharper / more in-focus. Used to pick the keeper in a cluster. */
  sharpness: number;
}

export interface DuplicateCluster {
  /** All photo ids in the cluster (2+), best first. */
  ids: string[];
  /** The sharpest frame — stays selected. */
  bestId: string;
  /** The lower-quality near-duplicates — auto-deselected. */
  rejectedIds: string[];
}

/** Hamming distance between two 64-bit hashes (number of differing bits). */
export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let d = 0;
  while (x) {
    x &= x - 1n; // clear the lowest set bit
    d++;
  }
  return d;
}

/**
 * Cluster photos whose hashes are within `threshold` bits of each other
 * (transitively, via union-find) and return only the clusters with 2+ members.
 * Within each cluster the sharpest frame is the keeper; ties break on input
 * order (stable). Default threshold 10/64 ≈ "the same shot", conservative
 * enough to avoid merging genuinely different compositions.
 */
export function clusterDuplicates(
  items: Fingerprinted[],
  threshold = 10
): DuplicateCluster[] {
  const parent = new Map<string, string>();
  for (const it of items) parent.set(it.id, it.id);

  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // path compression
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (hammingDistance(items[i].hash, items[j].hash) <= threshold) {
        union(items[i].id, items[j].id);
      }
    }
  }

  // Group members by root, preserving input order within each group.
  const groups = new Map<string, Fingerprinted[]>();
  for (const it of items) {
    const root = find(it.id);
    const arr = groups.get(root);
    if (arr) arr.push(it);
    else groups.set(root, [it]);
  }

  const clusters: DuplicateCluster[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    // Best = max sharpness; stable on ties (keeps the earlier frame).
    let best = members[0];
    for (const m of members) {
      if (m.sharpness > best.sharpness) best = m;
    }
    const ordered = [best, ...members.filter((m) => m.id !== best.id)];
    clusters.push({
      ids: ordered.map((m) => m.id),
      bestId: best.id,
      rejectedIds: members.filter((m) => m.id !== best.id).map((m) => m.id),
    });
  }
  return clusters;
}
