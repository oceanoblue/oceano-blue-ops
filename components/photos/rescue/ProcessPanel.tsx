'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CheckCircle2, Loader2, Play, RefreshCw, Wand2, XCircle } from 'lucide-react';

export type ProcessedAsset = {
  id: string;
  filename: string;
  status: string;
  thumb_url: string | null;
  processing_kind: string | null;
  profile: string | null;
};

export type ProcessTask = {
  id: string;
  status: string;
  error: string | null;
  created_at: string;
  result: Record<string, unknown> | null;
};

function Thumb({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div className="grid aspect-[4/3] w-full place-items-center rounded bg-slate-100 text-slate-300">
        <Camera className="h-5 w-5" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="aspect-[4/3] w-full rounded object-cover" />;
}

function TaskIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 text-rose-600" />;
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-ocean-700" />;
  return <RefreshCw className="h-4 w-4 text-slate-400" />;
}

export function ProcessPanel({
  jobId,
  outputs,
  tasks,
}: {
  jobId: string;
  outputs: ProcessedAsset[];
  tasks: ProcessTask[];
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<'natural' | 'airy' | 'luxury'>('natural');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function queueProcess() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/re-photo/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, profile }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.hint || json.error || 'Processing could not be queued.');
        return;
      }
      setMessage(`Queued ${json.items} item(s).`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Wand2 className="h-4 w-4 text-ocean-700" />
            Process outputs
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Creates local derivative outputs from reviewed bracket sets and active singles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            value={profile}
            disabled={busy}
            onChange={(e) => setProfile(e.target.value as typeof profile)}
          >
            <option value="natural">Natural</option>
            <option value="airy">Airy</option>
            <option value="luxury">Luxury</option>
          </select>
          <button className="btn-primary" disabled={busy} onClick={queueProcess}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Queue processing
          </button>
        </div>
      </div>

      {message && <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{message}</p>}

      {tasks.length > 0 && (
        <div className="rounded-md border border-slate-100">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase text-slate-400">
            Worker tasks
          </div>
          <ul className="divide-y divide-slate-100">
            {tasks.slice(0, 5).map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <TaskIcon status={task.status} />
                  <span className="truncate font-mono text-xs text-slate-500">{task.id}</span>
                </span>
                <span className="capitalize text-slate-600">{task.error ?? task.status.replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outputs.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-900">Processed outputs ({outputs.length})</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {outputs.map((asset) => (
              <div key={asset.id} className="rounded-md border border-slate-100 p-2">
                <Thumb url={asset.thumb_url} alt={asset.filename} />
                <div className="mt-2 min-w-0">
                  <div className="truncate text-xs font-medium text-slate-800">{asset.filename}</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500">
                    {asset.processing_kind && <span className="pill bg-slate-100 text-slate-600">{asset.processing_kind}</span>}
                    {asset.profile && <span className="pill bg-ocean-50 text-ocean-700">{asset.profile}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
