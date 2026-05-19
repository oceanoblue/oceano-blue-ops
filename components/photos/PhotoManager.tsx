'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Wand2, RefreshCw, CheckCircle2, AlertCircle, Loader2, FileImage } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AiJobType, Photo } from '@/lib/supabase/database.types';
import { PhotoViewer } from './PhotoViewer';
import { tusUpload, RESUMABLE_THRESHOLD_BYTES } from '@/lib/storage/tus-upload';

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
  const [provider, setProvider] = useState<
    'auto' | 'oceano-enhance' | 'autoenhance' | 'openai-gpt-image' | 'gemini-banana-pro'
  >('auto');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // URL cache keyed by photo_id — share between thumbnails and the viewer so
  // we don't fetch the signed URL twice.
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({});
  // Viewer state: which photo list + index is open. null = closed.
  const [viewer, setViewer] = useState<{ list: 'raw' | 'processed'; index: number } | null>(null);

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

      const supabase = createClient();
      // Upload up to 3 files in parallel — keeps the network busy without
      // overwhelming the browser on phones / older laptops.
      const concurrency = 3;
      const registered: Array<{
        photo_id: string;
        filename: string;
        storage_path: string;
        mime_type: string;
        byte_size: number;
      }> = [];

      let done = 0;
      let aborted = false;

      async function uploadOne(file: File) {
        if (aborted) return;
        const photoId = crypto.randomUUID();
        // Strip characters that confuse Supabase storage paths
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const storagePath = `${orderId}/${photoId}-${safeName}`;
        const contentType = file.type || 'application/octet-stream';

        try {
          if (file.size >= RESUMABLE_THRESHOLD_BYTES) {
            // Large files (ARW etc.) use chunked resumable uploads. Survives
            // network blips and any plan size cap that single-PUT would hit.
            await tusUpload({
              file,
              bucket: 'raw-photos',
              objectName: storagePath,
              contentType,
            });
          } else {
            // Small files: a single PUT is faster (no chunk negotiation).
            const { error } = await supabase.storage
              .from('raw-photos')
              .upload(storagePath, file, {
                contentType,
                upsert: false,
                cacheControl: '3600',
              });
            if (error) throw error;
          }
        } catch (err: any) {
          aborted = true;
          setError(`Upload failed: ${err?.message || err}`);
          return;
        }
        registered.push({
          photo_id: photoId,
          filename: file.name,
          storage_path: storagePath,
          mime_type: contentType,
          byte_size: file.size,
        });
        done += 1;
        setProgress({ done, total: files.length });
      }

      // Simple promise pool
      const queue = files.slice();
      async function worker() {
        while (queue.length && !aborted) {
          const next = queue.shift();
          if (next) await uploadOne(next);
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(concurrency, files.length) }, () => worker())
      );

      if (registered.length > 0) {
        const r = await fetch('/api/photos/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ order_id: orderId, photos: registered }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setError(`Register failed: ${j.error || r.statusText}`);
        }
      }

      setUploading(false);
      setProgress(null);
      refresh();
    },
    [orderId, refresh]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // Accept common JPEG/PNG plus RAW extensions even when the browser reports
    // no specific mime type (most browsers don't have a MIME for ARW/CR2/etc.)
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.webp'],
      'application/octet-stream': ['.arw', '.cr2', '.cr3', '.nef', '.dng', '.raf', '.rw2', '.orf'],
    },
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
            : 'Drop photos here, or click to choose files'}
        </p>
        <p className="text-xs text-slate-500">
          JPEG / PNG / TIFF / WebP for AI processing. ARW / CR2 / CR3 / NEF / DNG accepted for storage
          but must be converted to JPEG before AI editing.
        </p>
      </div>

      {photos.some((p) => /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i.test(p.filename)) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Heads up:</strong> RAW files uploaded above can't be sent directly to GPT Image or
          Gemini. Export them to JPEG (sRGB, 2048-3000px on the long edge) in Lightroom / Capture One
          first, then upload the JPEGs to run an AI job.
        </div>
      )}

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
              <option value="oceano-enhance">Oceano Enhance (no AI)</option>
              <option value="autoenhance">Autoenhance.ai</option>
              <option value="gemini-banana-pro">Nano Banana Pro</option>
              <option value="openai-gpt-image">GPT Image 2</option>
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
        onOpen={(i) => setViewer({ list: 'raw', index: i })}
        urls={photoUrls}
        setUrls={setPhotoUrls}
        onConverted={refresh}
      />
      <PhotoGrid
        title={`Processed (${processedPhotos.length})`}
        photos={processedPhotos}
        selected={selected}
        onToggle={toggle}
        onOpen={(i) => setViewer({ list: 'processed', index: i })}
        urls={photoUrls}
        setUrls={setPhotoUrls}
        processed
      />

      {jobs.length > 0 && <JobsTable jobs={jobs} />}

      {viewer && (
        <PhotoViewer
          photos={viewer.list === 'raw' ? rawPhotos : processedPhotos}
          index={viewer.index}
          urls={photoUrls}
          onClose={() => setViewer(null)}
          onIndexChange={(i) => setViewer({ ...viewer, index: i })}
          onPhotosChanged={refresh}
        />
      )}
    </div>
  );
}

function PhotoGrid({
  title,
  photos,
  selected,
  onToggle,
  onOpen,
  urls,
  setUrls,
  processed,
  onConverted,
}: {
  title: string;
  photos: Photo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (index: number) => void;
  urls: Record<string, string | null>;
  setUrls: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  processed?: boolean;
  onConverted?: () => void;
}) {
  if (photos.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-700 mb-2">{title}</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {photos.map((p, i) => (
          <Thumbnail
            key={p.id}
            photo={p}
            selected={selected.has(p.id)}
            onToggle={onToggle}
            onOpen={() => onOpen(i)}
            urls={urls}
            setUrls={setUrls}
            processed={processed}
            onConverted={onConverted}
          />
        ))}
      </div>
    </div>
  );
}

function Thumbnail({
  photo,
  selected,
  onToggle,
  onOpen,
  urls,
  setUrls,
  processed,
  onConverted,
}: {
  photo: Photo;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: () => void;
  urls: Record<string, string | null>;
  setUrls: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  processed?: boolean;
  onConverted?: () => void;
}) {
  const url = urls[photo.id];
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const isRaw = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i.test(photo.filename);

  useEffect(() => {
    if (url !== undefined) return; // already fetched (or null on failure)
    fetch(`/api/photo-url?photo_id=${photo.id}`)
      .then((r) => r.json())
      .then((d) => setUrls((u) => ({ ...u, [photo.id]: d.url ?? null })))
      .catch(() => setUrls((u) => ({ ...u, [photo.id]: null })));
  }, [photo.id, url, setUrls]);

  async function convert() {
    setConverting(true);
    setConvertError(null);
    try {
      const r = await fetch('/api/photos/convert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photo_id: photo.id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setConvertError(data.error || 'convert_failed');
      } else {
        onConverted?.();
      }
    } finally {
      setConverting(false);
    }
  }

  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded-md ring-2 transition cursor-zoom-in ${
        selected ? 'ring-ocean-600' : 'ring-transparent hover:ring-slate-300'
      }`}
      onClick={onOpen}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.filename} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-slate-100 grid place-items-center text-slate-400 text-xs">
          loading…
        </div>
      )}

      {/* Selection checkbox — stop click so it doesn't open the viewer */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(photo.id);
        }}
        className={`absolute top-1 left-1 h-5 w-5 grid place-items-center rounded border text-[10px] transition ${
          selected
            ? 'bg-ocean-600 border-ocean-600 text-white'
            : 'bg-white/85 border-slate-300 text-slate-500 opacity-0 group-hover:opacity-100'
        }`}
        title={selected ? 'Deselect' : 'Select for batch'}
      >
        {selected ? '✓' : ''}
      </button>

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

      {/* RAW badge + Convert button (only on the raw side) */}
      {isRaw && !processed && (
        <>
          <div className="absolute bottom-1 left-1 text-[10px] font-semibold uppercase tracking-wide bg-amber-500 text-amber-950 px-1.5 py-0.5 rounded">
            RAW
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              convert();
            }}
            disabled={converting}
            className="absolute bottom-1 right-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-ocean-600/90 text-white hover:bg-ocean-700 disabled:opacity-60 inline-flex items-center gap-1"
            title="Convert RAW to JPEG via worker"
          >
            {converting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileImage className="h-3 w-3" />
            )}
            {converting ? 'Converting' : 'Convert'}
          </button>
          {convertError && (
            <div
              className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded shadow"
              onClick={(e) => e.stopPropagation()}
            >
              {convertError}
            </div>
          )}
        </>
      )}
    </div>
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
