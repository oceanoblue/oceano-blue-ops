import { productCaptureSkills } from '@/lib/booking/capture-skills';

/** Price-free fields only. Used by authenticated pages and trusted notification jobs. */
export const SERVICE_SCOPE_COLUMNS = 'services_revision,internal_notes,photographer_id,videographer_id,order_items(description,quantity,products(name,kind,slug)),order_services(service_type,description,quantity)';

type Item = { description?: string | null; quantity?: number | null; products?: { name: string; kind: string; slug?: string } | null };
type LegacyService = { service_type: string; description?: string | null; quantity?: number | null };
export type ServiceOrder = {
  order_items?: Item[] | null;
  order_services?: LegacyService[] | null;
  internal_notes?: string | null;
  services_revision?: number | null;
  photographer_id?: string | null;
  videographer_id?: string | null;
};
export type ServiceScope = { labels: string[]; has360: boolean; hasFloorPlan: boolean; splitCrew: boolean };

const legacyLabels: Record<string, string> = {
  photos: 'Photography', photo: 'Photography', photography: 'Photography',
  '360': '360 Tour', virtual_tour: '360 Virtual Tour', matterport: 'Matterport 3D Tour',
  photos_hdr: 'HDR Photography', photos_standard: 'Photography', drone_photos: 'Drone Photography', drone_video: 'Drone Video',
  video_walkthrough: 'Video Walkthrough', rush_delivery: 'Rush Delivery',
  floor_plan: 'Floor Plan', drone: 'Drone', video: 'Video', videography: 'Videography', twilight: 'Twilight Photography',
};

/** Current items win over old service rows/notes, including explicitly cleared orders. */
export function serviceScope(order: ServiceOrder, allCrew = false): ServiceScope {
  const splitCrew = !!order.videographer_id && order.videographer_id !== order.photographer_id;
  let items: Item[];
  if (order.order_items?.length || (order.services_revision ?? 0) > 0) items = order.order_items ?? [];
  else if (order.order_services?.length) items = order.order_services.map(s => ({
    description: s.description || legacyLabels[s.service_type] || s.service_type.replaceAll('_', ' '),
    quantity: s.quantity,
    products: { name: `${legacyLabels[s.service_type] || s.service_type} ${s.description || ''}`, kind: s.service_type },
  }));
  else items = /^Field services:\s*/i.test(order.internal_notes || '')
    ? order.internal_notes!.replace(/^Field services:\s*/i, '').split(',').map(s => ({ description: legacyLabels[s.trim()] || s.trim() }))
    : [];

  const scope: ServiceScope = { labels: [], has360: false, hasFloorPlan: false, splitCrew };
  for (const item of items) {
    if ((item.quantity ?? 1) <= 0) continue;
    const description = item.description?.trim() || item.products?.name?.trim();
    if (!description) continue;
    const name = [description, item.products?.name, item.products?.slug].filter(Boolean).join(' ');
    const kind = item.products?.kind || '';
    const skills = productCaptureSkills({ name, kind });
    if (!skills.length || (!allCrew && splitCrew && skills.includes('videography'))) continue;
    const tour = kind === 'tour' || /360|matterport|virtual[ _-]?tour|3d[ _-]?(home|tour)|three_d_floor_plan/i.test(name);
    const floor = kind === 'floor_plan' || /floor[ _-]?plan/i.test(name);
    scope.has360 ||= tour;
    scope.hasFloorPlan ||= floor;
    const label = `${(item.quantity ?? 1) > 1 ? `${item.quantity} × ` : ''}${description}${tour && !/360/.test(description) ? ' (360 tour)' : ''}`;
    if (!scope.labels.includes(label)) scope.labels.push(label);
  }
  return scope;
}

export function scopeText(scope: ServiceScope): string {
  return scope.labels.length ? scope.labels.join(', ') : 'Services not specified. Confirm with the office before the shoot.';
}
