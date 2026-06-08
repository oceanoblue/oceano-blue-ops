'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderSearch, Loader2 } from 'lucide-react';

type JobOption = { id: string; title: string };

/**
 * Queue a scan_folder task for a job without touching the DevTools console.
 * The worker validates the root_path against its own allowlist before reading.
 */
export function EnqueueScanForm({ jobs }: { jobs: JobOption[] }) {
  const router = useRouter();
  const [jobId, setJobId] = useState(jobs[0]?.id ?? '');
  const [rootPath, setRootPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobId || !rootPath.trim()) {
      setMsg('Pick a job and enter a folder path.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/worker/tasks/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, task_type: 'scan_folder', payload: { root_path: rootPath.trim() } }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(`Failed: ${json.error ?? res.status}`);
      } else {
        setMsg('Queued ✓ — an online worker will pick it up within ~15s.');
        setRootPath('');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="card p-4 text-sm text-slate-500">
        Create a job first (e.g. in Photo Rescue) to queue a folder scan against it.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Queue a folder scan</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <div>
          <label className="label">Job</label>
          <select className="input" value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={busy}>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Folder path (inside a worker root)</label>
          <input
            className="input"
            placeholder="/Volumes/home/WORKFLOW/some-shoot"
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            disabled={busy}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
          Queue scan
        </button>
      </div>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
    </form>
  );
}
