import { createClient } from '@/lib/supabase/server';
import { RegisterWorkerButton } from '@/components/workers/RegisterWorkerButton';
import { EnqueueScanForm } from '@/components/workers/EnqueueScanForm';

export const dynamic = 'force-dynamic';

/** Online if it heartbeat within the last 2 minutes. */
function isOnline(status: string, lastHeartbeat: string | null): boolean {
  if (!lastHeartbeat) return false;
  return status === 'online' && Date.now() - new Date(lastHeartbeat).getTime() < 120_000;
}

export default async function WorkersPage() {
  const supabase = createClient();
  const { data: workers } = await supabase
    .from('local_workers')
    .select('id, name, hostname, status, capabilities, last_heartbeat_at, api_key_prefix, created_at')
    .order('created_at', { ascending: false });

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title')
    .order('created_at', { ascending: false })
    .limit(50);
  const jobOptions = (jobs ?? []).map((j: any) => ({ id: j.id, title: j.title ?? j.id }));

  const { data: recentTasks } = await supabase
    .from('worker_tasks')
    .select('id, task_type, status, created_at, result, error, jobs(title)')
    .order('created_at', { ascending: false })
    .limit(15);

  const taskStatusStyle: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700',
    running: 'bg-sky-100 text-sky-700',
    queued: 'bg-slate-100 text-slate-600',
    failed: 'bg-rose-100 text-rose-700',
    cancelled: 'bg-slate-100 text-slate-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ocean-950">Local Workers</h1>
          <p className="text-sm text-slate-600">
            Local/NAS machines that scan folders and index assets. Heavy media stays local; only
            metadata + lightweight thumbnails come back.
          </p>
        </div>
        <RegisterWorkerButton />
      </div>

      <EnqueueScanForm jobs={jobOptions} />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head px-4 py-3">Worker</th>
              <th className="table-head px-4 py-3">Status</th>
              <th className="table-head px-4 py-3">Capabilities</th>
              <th className="table-head px-4 py-3">Last heartbeat</th>
              <th className="table-head px-4 py-3">Key</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(workers ?? []).map((w: any) => {
              const online = isOnline(w.status, w.last_heartbeat_at);
              return (
                <tr key={w.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{w.name}</div>
                    <div className="text-xs text-slate-500">{w.hostname ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`pill ${online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {online ? 'online' : 'offline'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{(w.capabilities ?? []).join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {w.last_heartbeat_at ? new Date(w.last_heartbeat_at).toLocaleString() : 'never'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{w.api_key_prefix ?? '—'}…</td>
                </tr>
              );
            })}
            {(workers ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  No workers registered yet. Register one, then run the local worker client with its API key.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Recent tasks</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="table-head px-4 py-3">Task</th>
                <th className="table-head px-4 py-3">Job</th>
                <th className="table-head px-4 py-3">Status</th>
                <th className="table-head px-4 py-3">Detail</th>
                <th className="table-head px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(recentTasks ?? []).map((t: any) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{t.task_type?.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-slate-600">{t.jobs?.title ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`pill ${taskStatusStyle[t.status] ?? 'bg-slate-100 text-slate-600'}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {t.error
                      ? t.error
                      : t.result
                      ? Object.entries(t.result).map(([k, v]) => `${k}: ${v}`).join(' · ')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{new Date(t.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {(recentTasks ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No worker tasks yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
