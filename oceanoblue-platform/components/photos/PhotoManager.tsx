'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Wand2, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AiJobType, Photo } from '@/lib/supabase/database.types';

const JOB_TYPES: Array<{ id: AiJobType; label: string; helper: string }> = [
  { id: 'hdr_merge', label: 'HDR merge (brackets)', helper: 'Detects 3/5/7-shot brackets and merges each set' },
  { id: 'enhance_single', label: 'Enhance non-HDR', helper: 'Single-shot retouch: WB, shadows, highlights, noise' },
  { id: 'sky_replace', label: 'Sky replace', helper: 'Clean daytime sky on exteriors' },
  { id: 'window_pull', label: 'Window pull', helper: 'Recover blown windows' },
  { id: 'lawn_enhance', label: 'Lawn enhance', helper: 'Even out green grass' },
  { id: 'declutter', label: 'Light declutter', helper: 'Remove small personal items' },
  { id: 'twilight_convert', label: 'Twilight convert', helper: 'Daytime → twilight exterior' },
];

interface JobView {
  id: string;
  job_type: string;
  provider: string;
  status: string;
  cost_cents: number | null;
  duration_ms: number | null;
  error_message: string | null;
}

export function PhotoManager({ orderId }: { orderId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [jobType, setJobType] = useState<AiJobType>('hdr_merge');
  const [provider, setProvider] = useState<'auto' | 'openai-gpt-image' | 'gemini-banana-pro'>('auto');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data: ps } = await supabase
      .from('photos')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    setPhotos((ps ?? []) as Photo[]);
    const r = await fetch(`/api/ai/status?order_id=${orderId}`);
    const j = await r.json();
    setJobs(j.jobs ?? []);
  }, [orderId]);

  useEffect(() => { refresh(); }, [refresh]);

  const onDrop = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setUploading(true);
      setError(null);
      setProgress({ done: 0, total: files.length });
      // Upload in batches of 6 to keep memory sane
      const batchSize = 6;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const form = new FormData();
        form.append('order_id', orderId);
        batch.forEach((f) => form.append('files', f));
        const r = await fetch('/api/upload', { method: 'POST', body: form });
        if (!r.ok) {
          setError(`Upload failed: ${(await r.json()).error}`);
          break;
        }
        setProgress({ done: Math.min(i + batchSize, files.length), total: files.length });
      }
      setUploading(false);
      setProgress(null);
      refresh();
    },
    [orderId, refresh]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    disabled: uploading,
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runJob() {
    setRunning(true);
    setError(null);
    const body = {
      order_id: orderId,
      job_type: jobType,
      provider,
      photo_ids: selected.size ? Array.from(selected) : undefined,
    };
    const r = await fetch('/api/ai/process', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) setError(data.error || 'failed');
    setRunning(false);
    setSelected(new Set());
    refresh();
  }

  const rawPhotos = photos.filter((p) => p.kind === 'raw');
  const processedPhotos = photos.filter((p) => p.kind === 'processed');

  return (
    <div className="space-y-6">
      <div
        {...getRootProps()}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition cursor-pointer ${
          isDragActive ? 'border-ocean-500 bg-ocean-50' : 'border-slate-300 hover:bg-slate-50'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-6 w-6 text-slate-400" />
        <p className="mt-2 text-sm text-slate-700">
          {uploading
            ? `Uploading ${progress?.done ?? 0}/${progress?.total ?? 0}…`
            : 'Drop raw photos here, or click to choose files'}
        </p>
        <p className="text-xs text-slate-500">Bracketed HDR sets are detected automatically by EXIF.</p>
      </div>

      <div className="card p-4 bg-slate-50">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="label">AI job</label>
            <select className="input" value={jobType} onChange={(e) => setJobType(e.target.value as AiJobType)}>
              {JOB_TYPES.map((j) => (
                <option key={j.id} value={j.id}>{j.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {JOB_TYPES.find((j) => j.id === jobType)?.helper}
            </p>
          </div>
          <div>
            <label className="label">Provider</label>
            <select className="input" value={provider} onChange={(e) => setProvider(e.target.value as any)}>
              <option value="auto">Auto (recommended)</option>
              <option value="gemini-banana-pro">Gemini Banana Pro</option>
              <option value="openai-gpt-image">OpenAI GPT Image</option>
            </select>
          </div>
          <button
            className="btn-primary"
            disabled={running || rawPhotos.length === 0}
            onClick={runJob}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {selected.size > 0
              ? `Run on ${selected.size} selected`
              : jobType === 'hdr_merge' ? 'Auto-detect brackets & run' : 'Run on all raw'}
          </button>
          <button className="btn-ghost" onClick={refresh} disabled={running}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      </div>

      <PhotoGrid
        title={`Raw uploads (${rawPhotos.length})`}
        photos={rawPhotos}
        selected={selected}
        onToggle={toggle}
      />
      <PhotoGrid
        title={`Processed (${processedPhotos.length})`}
        photos={processedPhotos}
        selected={selected}
        onToggle={toggle}
        processed
      />

      {jobs.length > 0 && <JobsTable jobs={jobs} />}
    </div>
  );
}

function PhotoGrid({
  title,
  photos,
  selected,
  onToggle,
  processed,
}: {
  title: string;
  photos: Photo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  processed?: boolean;
}) {
  if (photos.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-700 mb-2">{title}</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {photos.map((p) => (
          <Thumbnail key={p.id} photo={p} selected={selected.has(p.id)} onToggle={onToggle} processed={processed} />
        ))}
      </div>
    </div>
  );
}

function Thumbnail({
  photo,
  selected,
  onToggle,
  processed,
}: {
  photo: Photo;
  selected: boolean;
  onToggle: (id: string) => void;
  processed?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/photo-url?photo_id=${photo.id}`)
      .then((r) => r.json())
      .then((d) => setUrl(d.url ?? null))
      .catch(() => {});
  }, [photo.id]);

  return (
    <button
      onClick={() => onToggle(photo.id)}
      className={`relative aspect-square overflow-hidden rounded-md ring-2 transition ${
        selected ? 'ring-ocean-600' : 'ring-transparent hover:ring-slate-300'
      }`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.filename} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-slate-100 grid place-items-center text-slate-400 text-xs">
          loading…
        </div>
      )}
      {photo.processing_status === 'running' && (
        <div className="absolute inset-0 bg-black/50 grid place-items-center text-white">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {photo.processing_status === 'failed' && (
        <div className="absolute top-1 right-1 text-rose-200">
          <AlertCircle className="h-4 w-4" />
        </div>
      )}
      {processed && photo.is_selected && (
        <div className="absolute top-1 right-1 text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
        </div>
      )}
    </button>
  );
}

function JobsTable({ jobs }: { jobs: JobView[] }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left">
            <th className="table-head px-4 py-2">Job</th>
            <th className="table-head px-4 py-2">Provider</th>
            <th className="table-head px-4 py-2">Status</th>
            <th className="table-head px-4 py-2">Cost</th>
            <th className="table-head px-4 py-2">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="px-4 py-2">{j.job_type}</td>
              <td className="px-4 py-2 text-slate-600">{j.provider}</td>
              <td className="px-4 py-2">{j.status}</td>
              <td className="px-4 py-2">${((j.cost_cents ?? 0) / 100).toFixed(2)}</td>
              <td className="px-4 py-2">{j.duration_ms ? `${(j.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
