'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileImage,
  Camera,
  ThumbsUp,
  ThumbsDown,
  RotateCw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AiJobType, Photo } from '@/lib/supabase/database.types';
import { PhotoViewer } from './PhotoViewer';
import { ProcessSidebar, type EditKind, type ProviderId } from './ProcessSidebar';
import { BracketCard } from './BracketCard';
import { tusUpload, RESUMABLE_THRESHOLD_BYTES } from '@/lib/storage/tus-upload';
import { groupPhotosIntoBrackets, isRawFilename } from '@/lib/photos/bracket-grouping';
import type { BracketGroup } from '@/lib/photos/bracket-grouping';

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
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({});
  const [viewer, setViewer] = useState<{ list: 'raw' | 'processed'; index: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Selection — separate sets for brackets (group ids) and singles (photo ids)
  // so we can show the right counts in the sidebar and run the right job type
  // per selection.
  const [selectedBrackets, setSelectedBrackets] = useState<Set<string>>(new Set());
  const [selectedSingles, setSelectedSingles] = useState<Set<string>>(new Set());

  // Sidebar config
  const [edits, setEdits] = useState<Set<EditKind>>(
    new Set(['hdr_merge', 'enhance_single'])
  );
  const [provider, setProvider] = useState<ProviderId>('auto');

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

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while anything is running so the user sees progress without manual refresh.
  useEffect(() => {
    const hasInFlight = jobs.some(
      (j) => j.status === 'pending' || j.status === 'queued' || j.status === 'running'
    );
    if (!hasInFlight) return;
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [jobs, refresh]);

  // Split photos into raw / processed and group raw into brackets/singles
  const rawPhotos = useMemo(() => photos.filter((p) => p.kind === 'raw'), [photos]);
  const processedPhotos = useMemo(() => photos.filter((p) => p.kind === 'processed'), [photos]);
  const { brackets, singles } = useMemo(() => groupPhotosIntoBrackets(rawPhotos), [rawPhotos]);

  // ─── Upload ──────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setUploading(true);
      setRunError(null);
      setUploadProgress({ done: 0, total: files.length });

      const supabase = createClient();
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
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const storagePath = `${orderId}/${photoId}-${safeName}`;
        const contentType = file.type || 'application/octet-stream';

        try {
          if (file.size >= RESUMABLE_THRESHOLD_BYTES) {
            await tusUpload({ file, bucket: 'raw-photos', objectName: storagePath, contentType });
          } else {
            const { error } = await supabase.storage
              .from('raw-photos')
              .upload(storagePath, file, { contentType, upsert: false, cacheControl: '3600' });
            if (error) throw error;
          }
        } catch (err: any) {
          aborted = true;
          setRunError(`Upload failed: ${err?.message || err}`);
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
        setUploadProgress({ done, total: files.length });
      }

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
          setRunError(`Register failed: ${j.error || r.statusText}`);
        }
      }

      setUploading(false);
      setUploadProgress(null);
      refresh();
    },
    [orderId, refresh]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.webp'],
      'application/octet-stream': ['.arw', '.cr2', '.cr3', '.nef', '.dng', '.raf', '.rw2', '.orf'],
    },
    disabled: uploading,
  });

  // ─── Selection helpers ───────────────────────────────────────────────────
  function toggleBracket(id: string) {
    setSelectedBrackets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSingle(id: string) {
    setSelectedSingles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelectedBrackets(new Set(brackets.map((b) => b.id)));
    setSelectedSingles(new Set(singles.map((p) => p.id)));
  }
  function clearSelection() {
    setSelectedBrackets(new Set());
    setSelectedSingles(new Set());
  }

  // ─── Run the configured edits on the current selection ───────────────────
  async function runProcess() {
    setRunning(true);
    setRunError(null);

    // Build per-edit job payloads. HDR merge only applies to brackets;
    // single-shot edits apply to selected singles. Other edits (sky etc)
    // apply to whatever's selected.
    const selectedBracketGroups = brackets.filter((b) => selectedBrackets.has(b.id));
    const selectedSinglePhotos = singles.filter((p) => selectedSingles.has(p.id));

    type Submission = { job_type: AiJobType; photo_ids: string[] };
    const submissions: Submission[] = [];

    if (edits.has('hdr_merge')) {
      for (const b of selectedBracketGroups) {
        submissions.push({ job_type: 'hdr_merge', photo_ids: b.photos.map((p) => p.id) });
      }
    }
    if (edits.has('enhance_single')) {
      for (const p of selectedSinglePhotos) {
        submissions.push({ job_type: 'enhance_single', photo_ids: [p.id] });
      }
    }
    // Additional generative edits — apply to both brackets (using first frame as proxy)
    // and singles. The runner already handles bracket inputs gracefully.
    const everySelected = [
      ...selectedBracketGroups.map((b) => b.photos[0].id),
      ...selectedSinglePhotos.map((p) => p.id),
    ];
    const additionalEdits: AiJobType[] = ['sky_replace', 'window_pull', 'lawn_enhance', 'twilight_convert', 'declutter'];
    for (const e of additionalEdits) {
      if (!edits.has(e)) continue;
      for (const id of everySelected) {
        submissions.push({ job_type: e, photo_ids: [id] });
      }
    }

    try {
      for (const sub of submissions) {
        const r = await fetch('/api/ai/process', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            order_id: orderId,
            job_type: sub.job_type,
            provider,
            photo_ids: sub.photo_ids,
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `enqueue_failed_${r.status}`);
        }
      }
      clearSelection();
      refresh();
    } catch (err: any) {
      setRunError(err?.message || 'failed');
    } finally {
      setRunning(false);
    }
  }

  // Live job progress for the sidebar
  const jobProgress = useMemo(() => {
    const active = jobs.filter((j) =>
      ['pending', 'queued', 'running', 'complete', 'failed'].includes(j.status)
    );
    if (active.length === 0) return null;
    const done = active.filter((j) => j.status === 'complete' || j.status === 'failed').length;
    const total = active.length;
    return done < total ? { done, total } : null;
  }, [jobs]);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Main column */}
      <div className="space-y-6 min-w-0">
        {/* Drop zone */}
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
              ? `Uploading ${uploadProgress?.done ?? 0}/${uploadProgress?.total ?? 0}…`
              : 'Drop photos here, or click to choose files'}
          </p>
          <p className="text-xs text-slate-500">
            JPEG / PNG / TIFF / WebP run through AI directly. ARW / CR2 / NEF / DNG auto-convert via the worker.
          </p>
        </div>

        {/* Selection-control bar */}
        {(brackets.length > 0 || singles.length > 0) && (
          <div className="flex items-center justify-between text-sm">
            <div className="text-slate-600">
              {brackets.length} bracket{brackets.length === 1 ? '' : 's'}
              {brackets.length > 0 && singles.length > 0 && ' · '}
              {singles.length > 0 && `${singles.length} single${singles.length === 1 ? '' : 's'}`}
              {' '}detected
            </div>
            <div className="flex items-center gap-2">
              <button onClick={selectAll} className="text-xs text-ocean-700 hover:text-ocean-900">
                Select all
              </button>
              <span className="text-slate-300">·</span>
              <button onClick={clearSelection} className="text-xs text-slate-500 hover:text-slate-700">
                Clear
              </button>
              <span className="text-slate-300">·</span>
              <button onClick={refresh} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
          </div>
        )}

        {/* Bracket sets */}
        {brackets.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              Bracket sets ({brackets.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {brackets.map((b) => (
                <BracketCard
                  key={b.id}
                  bracket={b}
                  selected={selectedBrackets.has(b.id)}
                  onToggle={() => toggleBracket(b.id)}
                  urls={photoUrls}
                  setUrls={setPhotoUrls}
                />
              ))}
            </div>
          </section>
        )}

        {/* Singles */}
        {singles.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              Singles ({singles.length})
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {singles.map((p, i) => (
                <SingleThumb
                  key={p.id}
                  photo={p}
                  selected={selectedSingles.has(p.id)}
                  onToggle={() => toggleSingle(p.id)}
                  onOpen={() => {
                    const idx = rawPhotos.findIndex((rp) => rp.id === p.id);
                    setViewer({ list: 'raw', index: Math.max(0, idx) });
                  }}
                  urls={photoUrls}
                  setUrls={setPhotoUrls}
                  onConverted={refresh}
                />
              ))}
            </div>
          </section>
        )}

        {/* Processed */}
        {processedPhotos.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              Processed ({processedPhotos.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {processedPhotos.map((p, i) => (
                <ProcessedCard
                  key={p.id}
                  photo={p}
                  onOpen={() => setViewer({ list: 'processed', index: i })}
                  urls={photoUrls}
                  setUrls={setPhotoUrls}
                  onChange={refresh}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {brackets.length === 0 && singles.length === 0 && processedPhotos.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-500">
            No photos yet. Drop your shoot above to begin.
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <ProcessSidebar
        bracketCount={brackets.length}
        singleCount={singles.length}
        selectedBracketCount={selectedBrackets.size}
        selectedSingleCount={selectedSingles.size}
        edits={edits}
        onEditsChange={setEdits}
        provider={provider}
        onProviderChange={setProvider}
        running={running}
        onRun={runProcess}
        progress={jobProgress}
        error={runError}
      />

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

// ─── Single thumbnail card ──────────────────────────────────────────────────
function SingleThumb({
  photo,
  selected,
  onToggle,
  onOpen,
  urls,
  setUrls,
  onConverted,
}: {
  photo: Photo;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  urls: Record<string, string | null>;
  setUrls: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  onConverted: () => void;
}) {
  const url = urls[photo.id];
  const raw = isRawFilename(photo.filename);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const ext = (photo.filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toUpperCase();
  const sizeMB = photo.byte_size ? (photo.byte_size / 1024 / 1024).toFixed(1) : null;

  useEffect(() => {
    if (raw) return;
    if (url !== undefined) return;
    fetch(`/api/photo-url?photo_id=${photo.id}`)
      .then((r) => r.json())
      .then((d) => setUrls((u) => ({ ...u, [photo.id]: d.url ?? null })))
      .catch(() => setUrls((u) => ({ ...u, [photo.id]: null })));
  }, [photo.id, url, setUrls, raw]);

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
      if (!r.ok) setConvertError(data.error || `error_${r.status}`);
      else onConverted();
    } catch (err: any) {
      setConvertError(err?.message || 'network_error');
    } finally {
      setConverting(false);
    }
  }

  return (
    <div
      onClick={raw ? undefined : onOpen}
      className={`group relative aspect-square overflow-hidden rounded-md ring-2 transition ${
        raw ? '' : 'cursor-zoom-in'
      } ${selected ? 'ring-ocean-600' : 'ring-transparent hover:ring-slate-300'}`}
    >
      {raw ? (
        <div className="h-full w-full bg-gradient-to-br from-slate-700 to-slate-900 text-slate-100 flex flex-col items-center justify-center p-2 text-center">
          <Camera className="h-7 w-7 mb-1 text-slate-300" strokeWidth={1.5} />
          <div className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded bg-amber-500 text-amber-950 font-semibold">
            {ext}
          </div>
          <div className="mt-1 text-[10px] text-slate-300 truncate max-w-full">{photo.filename}</div>
          {sizeMB && <div className="text-[10px] text-slate-400">{sizeMB} MB</div>}
        </div>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.filename} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-slate-100 grid place-items-center text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}

      {/* Selection checkbox — always visible */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`absolute top-1.5 left-1.5 h-5 w-5 grid place-items-center rounded border-2 text-[11px] transition z-10 ${
          selected
            ? 'bg-ocean-600 border-ocean-600 text-white'
            : 'bg-white/90 border-white/90 text-slate-400'
        }`}
      >
        {selected ? '✓' : ''}
      </button>

      {raw && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              convert();
            }}
            disabled={converting}
            className="absolute inset-x-2 bottom-2 text-[11px] font-medium px-2 py-1.5 rounded-md bg-ocean-600 text-white hover:bg-ocean-500 disabled:opacity-60 inline-flex items-center justify-center gap-1 shadow z-10"
          >
            {converting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Converting…
              </>
            ) : (
              <>
                <FileImage className="h-3 w-3" />
                Convert to JPEG
              </>
            )}
          </button>
          {convertError && (
            <div className="absolute top-7 left-1 right-1 text-[10px] bg-rose-600 text-white px-1.5 py-1 rounded shadow truncate z-10" title={convertError}>
              {convertError}
            </div>
          )}
        </>
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
    </div>
  );
}

// ─── Processed photo card with Approve / Reject / Re-run ────────────────────
function ProcessedCard({
  photo,
  onOpen,
  urls,
  setUrls,
  onChange,
}: {
  photo: Photo;
  onOpen: () => void;
  urls: Record<string, string | null>;
  setUrls: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  onChange: () => void;
}) {
  const url = urls[photo.id];
  const [busy, setBusy] = useState<null | 'approve' | 'reject' | 'rerun'>(null);

  useEffect(() => {
    if (url !== undefined) return;
    fetch(`/api/photo-url?photo_id=${photo.id}`)
      .then((r) => r.json())
      .then((d) => setUrls((u) => ({ ...u, [photo.id]: d.url ?? null })))
      .catch(() => setUrls((u) => ({ ...u, [photo.id]: null })));
  }, [photo.id, url, setUrls]);

  async function decide(decision: 'approve' | 'reject' | 'reset') {
    setBusy(decision === 'reset' ? null : decision);
    try {
      await fetch('/api/photos/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photo_id: photo.id, decision }),
      });
      onChange();
    } finally {
      setBusy(null);
    }
  }

  async function rerun() {
    setBusy('rerun');
    try {
      const targetId = photo.parent_photo_id ?? photo.id;
      await fetch('/api/ai/process', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          order_id: photo.order_id,
          job_type: 'enhance_single',
          provider: 'oceano-enhance',
          photo_ids: [targetId],
        }),
      });
      onChange();
    } finally {
      setBusy(null);
    }
  }

  const isApproved = photo.is_selected === true;
  const isRejected = photo.is_selected === false;

  return (
    <div
      className={`group relative aspect-[3/2] overflow-hidden rounded-md ring-2 transition cursor-zoom-in ${
        isApproved
          ? 'ring-emerald-500'
          : isRejected
          ? 'ring-rose-300 opacity-60'
          : 'ring-transparent hover:ring-slate-300'
      }`}
      onClick={onOpen}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.filename} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-slate-100 grid place-items-center text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}

      {/* Status badge */}
      {isApproved && (
        <div className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-600 text-white px-1.5 py-0.5 rounded shadow">
          <CheckCircle2 className="h-3 w-3" /> Approved
        </div>
      )}

      {/* Action chip strip — always visible at bottom */}
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => decide(isApproved ? 'reset' : 'approve')}
          disabled={busy !== null}
          title={isApproved ? 'Un-approve' : 'Approve for delivery'}
          className={`p-1.5 rounded-md text-white text-xs transition ${
            isApproved ? 'bg-emerald-600' : 'bg-white/15 hover:bg-emerald-600'
          }`}
        >
          {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => decide(isRejected ? 'reset' : 'reject')}
          disabled={busy !== null}
          title={isRejected ? 'Un-reject' : 'Reject'}
          className={`p-1.5 rounded-md text-white text-xs transition ${
            isRejected ? 'bg-rose-600' : 'bg-white/15 hover:bg-rose-600'
          }`}
        >
          {busy === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={rerun}
          disabled={busy !== null}
          title="Re-run enhance on the source"
          className="p-1.5 rounded-md bg-white/15 text-white text-xs hover:bg-ocean-600 transition"
        >
          {busy === 'rerun' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
