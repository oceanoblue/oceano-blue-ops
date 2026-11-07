import type { Product } from './types';

/** Plain-language explanations for the choices in the client booking form. */
export function bookingDescription(product: Pick<Product, 'slug' | 'short_description'>): string {
  const descriptions: Record<string, string> = {
    interior_exterior_photo: 'Interior and exterior photos of the home, edited and ready for your listing.',
    cinematic_video: 'A walkthrough video of the home, inside and out. Drone footage is an optional add-on.',
    floor_plan: 'A 2D color floor plan showing the room layout and dimensions.',
    drone_photography: 'Aerial photos of the property, lot and surroundings. Add to a photo or walkthrough video booking.',
    drone_video: 'Aerial video footage. Add to a photo or walkthrough video booking. Does not include an interior walkthrough.',
    drone_photos_video: 'Drone photos and video from the air only. Does not include interior photos or a walkthrough of the home.',
    social_reel: 'A short vertical video for Instagram, TikTok and Stories.',
    reshoot: 'A return visit to take updated photos of a property.',
    three_d_floor_plan: 'A 3D model of the home with a floor plan. Available as an add-on to listing photography.',
    same_day_delivery: 'Receive your edited listing photos the same evening.',
    twilight: 'Exterior photos around sunset to show the home and its lighting.',
  };
  return descriptions[product.slug] ?? product.short_description ?? '';
}

export function serviceCategory(product: Pick<Product, 'slug' | 'kind' | 'is_addon'>): string {
  if (product.is_addon) return 'Optional add-on';
  if (product.slug === 'drone_photos_video') return 'Aerial coverage only';
  const labels: Record<string, string> = { photo: 'Photography', video: 'Video', floor_plan: 'Floor plan', tour: 'Virtual tour', fee: 'Service' };
  return labels[product.kind] ?? 'Service';
}
