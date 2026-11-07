export type SelectionProduct = {
  id: string;
  slug: string;
  name: string;
  is_addon: boolean;
};

/** Check the selected services without removing choices or changing prices.
 * The caller handles an empty selection before continuing or submitting.
 */
export function selectionProblem(selected: SelectionProduct[]): string | null {
  const bySlug = new Map(selected.map(product => [product.slug, product]));
  const floorPlan = bySlug.get('floor_plan');
  const threeD = bySlug.get('three_d_floor_plan');
  if (floorPlan && threeD) {
    return `${threeD.name} already includes a floor plan. Remove ${floorPlan.name} to avoid booking it twice.`;
  }

  const aerialBundle = bySlug.get('drone_photos_video');
  const droneAddon = bySlug.get('drone_photography') ?? bySlug.get('drone_video');
  if (aerialBundle && droneAddon) {
    return `${aerialBundle.name} already includes drone photos and video. Remove the separate drone add-ons, or remove the aerial package.`;
  }

  const hasPhotos = bySlug.has('interior_exterior_photo');
  const hasVideo = bySlug.has('cinematic_video');
  if (droneAddon && !hasPhotos && !hasVideo) {
    return `${droneAddon.name} needs Interior/Exterior Photography or Listing Walkthrough Video. Add one of those services, or remove this add-on.`;
  }

  const photoAddon = bySlug.get('same_day_delivery') ?? threeD;
  if (photoAddon && !hasPhotos) {
    return `${photoAddon.name} needs Interior/Exterior Photography when booked as an add-on. Add photography, or remove this add-on.`;
  }

  if (selected.some(product => product.is_addon) && !selected.some(product => !product.is_addon)) {
    return 'Choose a main service first. Add-ons cannot be booked on their own.';
  }

  return null;
}
