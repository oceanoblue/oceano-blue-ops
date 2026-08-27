/**
 * Worker-queue health. A task is "stuck" when it has sat queued past a short
 * grace window and NO currently-online worker advertises the capability to run
 * it — i.e. the exact silent failure where the NAS worker goes dark and photo
 * jobs pile up with nothing to claim them.
 */

export type StuckGroup = { task_type: string; count: number; oldest_created_at: string };

const ONLINE_WINDOW_MS = 120_000; // matches the Workers page "online" cutoff
const GRACE_MS = 5 * 60_000; // ignore tasks queued < 5 min (worker restarts, races)

export async function getStuckWorkerTasks(
  client: any
): Promise<{ groups: StuckGroup[]; total: number; onlineCaps: string[] }> {
  const nowMs = Date.now();

  const { data: workers } = await client
    .from('local_workers')
    .select('capabilities, status, last_heartbeat_at');

  const onlineCaps = new Set<string>();
  for (const w of workers ?? []) {
    const hb = w.last_heartbeat_at ? new Date(w.last_heartbeat_at).getTime() : 0;
    if (w.status === 'online' && nowMs - hb < ONLINE_WINDOW_MS) {
      for (const c of w.capabilities ?? []) onlineCaps.add(c);
    }
  }

  const cutoff = new Date(nowMs - GRACE_MS).toISOString();
  const { data: queued } = await client
    .from('worker_tasks')
    .select('task_type, created_at')
    .eq('status', 'queued')
    .lt('created_at', cutoff);

  const map = new Map<string, StuckGroup>();
  for (const t of queued ?? []) {
    if (onlineCaps.has(t.task_type)) continue; // a capable worker is online — not stuck for lack of one
    const g = map.get(t.task_type) ?? { task_type: t.task_type, count: 0, oldest_created_at: t.created_at };
    g.count += 1;
    if (new Date(t.created_at) < new Date(g.oldest_created_at)) g.oldest_created_at = t.created_at;
    map.set(t.task_type, g);
  }

  const groups = [...map.values()].sort((a, b) => b.count - a.count);
  return { groups, total: groups.reduce((s, g) => s + g.count, 0), onlineCaps: [...onlineCaps] };
}
