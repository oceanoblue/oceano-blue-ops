export type OrderWorkArea = 'overview' | 'upload' | 'review' | 'delivery';
export type WorkflowFacts = { status: string; archived: boolean; scheduled: boolean; assigned: boolean; originals: number; finals: number; media: number; services: number };

export function nextOrderAction(f: WorkflowFacts): { title: string; detail: string; label: string; area: OrderWorkArea } {
  if (f.archived) return { title: 'This order is archived', detail: 'Restore it in order settings when you need to resume work.', label: 'Order overview', area: 'overview' };
  if (f.status === 'cancelled') return { title: 'This shoot was cancelled', detail: 'Review the booking details before reopening the order.', label: 'Order overview', area: 'overview' };
  if (f.status === 'delivered') return { title: 'Delivered. Everything in one place.', detail: 'Open the client gallery, review delivery history, or prepare an update.', label: 'View delivery', area: 'delivery' };
  if (f.status === 'ready') return { title: 'Ready for the client', detail: 'Check the gallery and recipients, then send your delivery.', label: 'Prepare delivery', area: 'delivery' };
  if (f.finals > 0 || f.media > 0) return { title: 'Give the finished work a final look', detail: 'Review your photos and other media before preparing delivery.', label: 'Review media', area: 'review' };
  if (f.originals > 0 || ['uploaded','processing','editing'].includes(f.status)) return { title: 'Bring the finished work together', detail: 'Download the originals for editing, then upload the finished photos.', label: 'Upload finished photos', area: 'upload' };
  if (!f.services) return { title: 'Choose the services for this shoot', detail: 'Add the photography, video, and extras this client has booked.', label: 'Edit order details', area: 'overview' };
  if (!f.scheduled || !f.assigned) return { title: 'Finish the shoot details', detail: 'Confirm the appointment and photographer so everyone knows the plan.', label: 'Review schedule & team', area: 'overview' };
  return { title: 'The shoot is booked', detail: 'Your next step is collecting originals or uploading finished photos.', label: 'Open upload workspace', area: 'upload' };
}

export const ORDER_VIEWS = [
  { id: 'active', label: 'Active', statuses: ['draft','booked','scheduled','shooting','uploaded','processing','editing','ready'] },
  { id: 'upcoming', label: 'Upcoming', statuses: ['draft','booked','scheduled','shooting'] },
  { id: 'production', label: 'In production', statuses: ['uploaded','processing','editing'] },
  { id: 'ready', label: 'Ready to deliver', statuses: ['ready'] },
  { id: 'delivered', label: 'Delivered', statuses: ['delivered'] },
  { id: 'all', label: 'All orders', statuses: null },
] as const;

export function orderListHref(current: Record<string, string | undefined>, changes: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries({...current,...changes,page:changes.page})) if (value) params.set(key,value);
  return `/dashboard/orders${params.size ? `?${params}` : ''}`;
}
