export const CAPTURE_SKILLS = ['photography', 'videography', 'tour_360', 'drone', 'floor_plan'] as const;
export type CaptureSkill = typeof CAPTURE_SKILLS[number];
export const SKILL_LABELS: Record<CaptureSkill, string> = {
  photography: 'Photography', videography: 'Videography', tour_360: '360 / virtual tours', drone: 'Drone', floor_plan: 'Floor plans',
};

/** Keep in sync with product_capture_skills in the database. Delivery/editing add-ons need no on-site skill. */
export function productCaptureSkills(product: { name: string; kind: string }): CaptureSkill[] {
  const name = product.name.toLowerCase();
  if (/virtual staging|virtual twilight|delivery|rush|vertical social cut|weekend|holiday/.test(name)) return [];
  if (/drone/.test(name)) return /video/.test(name) ? ['drone', 'videography'] : ['drone'];
  if (product.kind === 'video' || /videography|video|reel/.test(name)) return ['videography'];
  if (product.kind === 'tour' || /360|matterport|virtual tour|3d home/.test(name)) return ['tour_360'];
  if (product.kind === 'floor_plan' || /floor plan/.test(name)) return ['floor_plan'];
  return ['photography'];
}

export function coversSkills(skills: string[] | undefined, required: CaptureSkill[]) {
  return required.every(skill => skills?.includes(skill));
}

export function crewMemberIds(order: { photographer_id?: string | null; videographer_id?: string | null; contractors?: { team_member_id?: string | null } | null }) {
  return [...new Set([order.contractors?.team_member_id || order.photographer_id, order.videographer_id].filter((id): id is string => !!id))];
}
