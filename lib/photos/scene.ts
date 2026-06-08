import { looksLikeDrone, type AssetLike } from './asset-bracket-detect';

/**
 * Scene classification foundation for Real Estate Photo Rescue.
 *
 * Categories are intentionally small and real-estate specific. Classification
 * can come from three sources, tracked in `assets.metadata.scene_source`:
 *   - 'heuristic' : cheap, set at ingest (drone from EXIF, else unknown)
 *   - 'manual'    : a human picked it in the review UI
 *   - 'ai'        : vision model (see scene-classify.ts), optional/foundation
 */
export const SCENE_TYPES = [
  'interior',
  'exterior',
  'drone',
  'twilight',
  'amenity',
  'detail',
  'unknown',
] as const;

export type SceneType = (typeof SCENE_TYPES)[number];

export type SceneSource = 'heuristic' | 'manual' | 'ai';

export function isSceneType(v: unknown): v is SceneType {
  return typeof v === 'string' && (SCENE_TYPES as readonly string[]).includes(v);
}

/**
 * Cheap classification from EXIF only — no image decode. Used at ingest so
 * every asset gets a starting scene. Drone is reliably detectable from EXIF
 * make/model; everything else needs pixels (AI) or a human, so defaults to
 * 'unknown'.
 */
export function heuristicScene(asset: AssetLike): SceneType {
  if (looksLikeDrone(asset)) return 'drone';
  return 'unknown';
}

const SCENE_BADGE: Record<SceneType, string> = {
  interior: 'bg-sky-100 text-sky-700',
  exterior: 'bg-emerald-100 text-emerald-700',
  drone: 'bg-violet-100 text-violet-700',
  twilight: 'bg-indigo-100 text-indigo-700',
  amenity: 'bg-teal-100 text-teal-700',
  detail: 'bg-amber-100 text-amber-800',
  unknown: 'bg-slate-100 text-slate-500',
};

export function sceneBadgeClass(scene: string | null | undefined): string {
  return SCENE_BADGE[(scene ?? 'unknown') as SceneType] ?? SCENE_BADGE.unknown;
}
