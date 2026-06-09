/**
 * Pipeline progression for callback-driven episode statuses. Make re-runs can
 * replay earlier events (idempotent retries, watcher re-triggers); a replayed
 * event must never move an episode BACKWARDS — e.g. a duplicate
 * transcription.completed arriving after copy.generated should not demote
 * needs_review to transcribed. Human decisions (needs_revision, archived,
 * cancelled) are deliberate overrides outside this ladder, set by the approve
 * route, never by callbacks.
 */
export const EPISODE_STATUS_RANK: Record<string, number> = {
  intake: 0,
  scheduled: 1,
  recorded: 2,
  ingested: 3,
  transcribed: 4,
  needs_review: 5,
  ready_to_publish: 6,
  published: 7,
};

/** Human-set end states a callback must never overwrite. */
const TERMINAL_STATUSES = new Set(['archived', 'cancelled']);

/** True when a callback event may set `next` given the episode is at `current`. */
export function advancesEpisodeStatus(current: string | null | undefined, next: string): boolean {
  const nxt = EPISODE_STATUS_RANK[next];
  if (nxt == null) return false; // unknown target — never write it from a callback
  if (current && TERMINAL_STATUSES.has(current)) return false;
  const cur = EPISODE_STATUS_RANK[current ?? ''];
  // Unknown/override current (e.g. needs_revision after a rejection): the
  // pipeline re-run is the recovery path, so it may resume forward.
  if (cur == null) return true;
  return nxt > cur;
}

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
