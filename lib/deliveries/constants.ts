// Canonical delivery taxonomy. Single source of truth shared by the Deliveries
// list page (server component) and the DeliveryManager island (client), so the
// type/status vocabularies and status colors never drift apart.

export const DELIVERY_TYPES: string[] = [
  'photo_gallery', 'download_zip', 'video_draft', 'video_final',
  'podcast_episode', 'podcast_clip', 'caption_file', 'thumbnail',
  'show_notes', 'social_caption_package', 'archive_package',
];

export const DELIVERY_STATUSES: string[] = [
  'draft', 'internal_review', 'client_review', 'changes_requested',
  'approved', 'delivered', 'published', 'archived',
];

export const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  internal_review: 'bg-amber-100 text-amber-800',
  client_review: 'bg-sky-100 text-sky-700',
  changes_requested: 'bg-rose-100 text-rose-700',
  approved: 'bg-violet-100 text-violet-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  published: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-slate-100 text-slate-400',
};

/** "video_final" -> "video final" for display. */
export function humanizeToken(value: string | null | undefined): string {
  return (value ?? '').replace(/_/g, ' ');
}
