/**
 * Photo production profiles.
 *
 * The market a shoot is for (chosen at order creation as `orders.project_type`)
 * selects a PROFILE — a bundle of finishing + delivery settings. This is ONE
 * parameterized pipeline, not four forks: the profile only changes the knobs,
 * never the code path.
 *
 * Phase A (live): `gradeStyle` is threaded to the deterministic edit engine and
 * `deliveryDefault` is the suggested export. The remaining fields (enabled
 * generative ops, QC ruleset, capture checklist) are declared here as the shape
 * for Phases B–D and are not enforced yet — see docs/HANDOFF-media-pipeline.md.
 */
export type ProjectType =
  | 'mls_real_estate'
  | 'luxury_real_estate'
  | 'architectural'
  | 'interior_design';

/** Finishing-grade style understood by the edit engine (worker-edit `grade`). */
export type GradeStyle = 'default' | 'sober';

/** Delivery preset keys (see app/api/delivery/[token]/download). */
export type DeliveryPreset = 'full' | '4k' | 'print' | 'web';

export interface PhotoProfile {
  id: ProjectType;
  label: string;
  description: string;
  /** Grade style passed to the edit engine. */
  gradeStyle: GradeStyle;
  /** Suggested default delivery preset for this market. */
  deliveryDefault: DeliveryPreset;
}

export const PHOTO_PROFILES: Record<ProjectType, PhotoProfile> = {
  mls_real_estate: {
    id: 'mls_real_estate',
    label: 'MLS Real Estate',
    description: 'Fast, bright, clean, consistent — the standard listing look.',
    gradeStyle: 'default',
    deliveryDefault: 'web',
  },
  luxury_real_estate: {
    id: 'luxury_real_estate',
    label: 'Luxury Real Estate',
    description: 'Elevated marketing finish. (Premium flash-blend stages: Phase D.)',
    gradeStyle: 'default',
    deliveryDefault: '4k',
  },
  architectural: {
    id: 'architectural',
    label: 'Architectural',
    description: 'Technically accurate, sober, documentary — not HDR-pushed.',
    gradeStyle: 'sober',
    deliveryDefault: '4k',
  },
  interior_design: {
    id: 'interior_design',
    label: 'Interior Design',
    description: 'Faithful colour & texture, editorial presentation.',
    gradeStyle: 'sober',
    deliveryDefault: '4k',
  },
};

export const DEFAULT_PROJECT_TYPE: ProjectType = 'mls_real_estate';

export const PROJECT_TYPES = Object.keys(PHOTO_PROFILES) as ProjectType[];

/** Resolve a profile from a raw `orders.project_type`, falling back to MLS. */
export function profileFor(projectType: string | null | undefined): PhotoProfile {
  return PHOTO_PROFILES[projectType as ProjectType] ?? PHOTO_PROFILES[DEFAULT_PROJECT_TYPE];
}
