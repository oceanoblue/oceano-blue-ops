/** Semantic pill colors per podcast episode status (vocabulary from migration 0019). */
export const EPISODE_STATUS_STYLE: Record<string, string> = {
  intake: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-sky-100 text-sky-700',
  recorded: 'bg-sky-100 text-sky-700',
  ingested: 'bg-slate-100 text-slate-600',
  transcribed: 'bg-sky-100 text-sky-700',
  editing: 'bg-violet-100 text-violet-700',
  clips_in_progress: 'bg-violet-100 text-violet-700',
  needs_review: 'bg-amber-100 text-amber-800',
  ready_to_publish: 'bg-violet-100 text-violet-700',
  needs_revision: 'bg-rose-100 text-rose-700',
  published: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-slate-100 text-slate-500',
};
