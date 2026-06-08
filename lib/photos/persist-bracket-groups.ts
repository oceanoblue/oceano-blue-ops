import { detectAssetBracketGroups, type AssetLike } from './asset-bracket-detect';

/**
 * Run bracket detection over a set of asset-likes and persist the results as
 * `asset_groups` + `asset_group_items`, marking grouped assets. Shared by the
 * Real Estate Photo Rescue ingest and the local-worker scan→rescue path.
 *
 * `admin` is a service-role Supabase client. Returns counts for logging.
 */
export async function persistDetectedGroups(admin: any, jobId: string, assets: AssetLike[]) {
  const detection = detectAssetBracketGroups(assets);
  let needsReview = 0;

  for (const g of detection.groups) {
    if (g.reviewRequired) needsReview++;
    const { data: grp, error } = await admin
      .from('asset_groups')
      .insert({
        job_id: jobId,
        group_type: 'real_estate_bracket',
        name: `${g.size}-shot bracket`,
        confidence_score: g.confidence,
        review_required: g.reviewRequired,
        metadata: { method: g.method, reason: g.reason, detected_size: g.size },
      })
      .select('id')
      .single();
    if (error || !grp) continue;

    await admin.from('asset_group_items').insert(
      g.assetIds.map((assetId, idx) => ({
        group_id: grp.id,
        asset_id: assetId,
        role: g.roles[assetId] ?? null,
        sort_order: idx,
      }))
    );
    await admin.from('assets').update({ status: 'grouped' }).in('id', g.assetIds);
  }

  return { groups: detection.groups.length, needs_review: needsReview, singles: detection.singleAssetIds.length };
}
