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
  Wand2,
  Sparkles,
  Sun,
  Square,
  Trees,
  MoonStar,
  Trash2,
  Sofa,
  Eraser,
  ChevronRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AiJobType, Photo } from '@/lib/supabase/database.types';
import { PhotoViewer } from './PhotoViewer';
import { BracketCard } from './BracketCard';
import { tusUpload, RESUMABLE_THRESHOLD_BYTES } from '@/lib/storage/tus-upload';
import {
  groupPhotosIntoBrackets,
  isRawFilename,
  readExifFromUrl,
  applyExifGrouping,
  type ExifSnapshot,
} from '@/lib/photos/bracket-grouping';

interface JobView {
  id: string;
  job_type: string;
  provider: string;
  status: string;
  cost_cents: number | null;
  duration_ms: number | null;
  error_message: string | null;
}

type Stage = 1 | 2 | 3;
type AiProvider = 'openai-gpt-image' | 'gemini-banana-pro' | 'oceano-enhance' | 'auto';

const STAGE_TITLES: Record<Stage, string> = {
  1: 'Sort & Merge',
  2: 'AI Enhance',
  3: 'Review & Edit',
};

export function PhotoManager({ orderId }: { orderId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({});
  const [viewer, setViewer] = useState<{ list: 'raw' | 'processed'; index: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>(1);

  // Stage 1 selection
  const [selectedBrackets, setSelectedBrackets] = useState<Set<string>>(new Set());
  const [selectedSingles, setSelectedSingles] = useState<Set<string>>(new Set());

  // Stage 2 config
  const [aiProvider, setAiProvider] = useState<AiProvider>('openai-gpt-image');
  const [autoDetect, setAutoDetect] = useState(true);
  const [stage2Selection, setStage2Selection] = useState<Set<string>>(new Set());

  // Stage 3 — open lightbox
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

  // Poll while anything is running.
  useEffect(() => {
    const hasInFlight = jobs.some(
      (j) => j.status === 'pending' || j.status === 'queued' || j.status === 'running'
    );
    if (!hasInFlight) return;
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [jobs, refresh]);

  // Categorize photos. For RAW files: if a JPEG sibling exists (a photo whose
  // parent_photo_id points back at the ARW and whose filename ends .jpg),
  // hide the ARW from view — the worker has already converted it and we want
  // the UI to show the converted JPEG instead of the unrenderable ARW.
  const rawPhotos = useMemo(() => {
    const all = photos.filter((p) => p.kind === 'raw');
    const replacedArwIds = new Set<string>();
    for (const p of all) {
      if (p.parent_photo_id && !isRawFilename(p.filename)) {
        // This JPEG was converted from p.parent_photo_id — hide the ARW.
        replacedArwIds.add(p.parent_photo_id);
      }
    }
    return all.filter((p) => !replacedArwIds.has(p.id));
  }, [photos]);
  const processedPhotos = useMemo(() => photos.filter((p) => p.kind === 'processed'), [photos]);

  // Build parent → children index so we can tell which merged JPEGs have
  // already been AI-enhanced (children exist) vs still awaiting Stage 2.
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const p of processedPhotos) {
      if (p.parent_photo_id) {
        const arr = map.get(p.parent_photo_id) ?? [];
        arr.push(p);
        map.set(p.parent_photo_id, arr);
      }
    }
    return map;
  }, [processedPhotos]);

  function hasEnhanceChild(photoId: string): boolean {
    const kids = childrenByParent.get(photoId) ?? [];
    return kids.some((k) => !isMerePassthrough(k));
  }

  // A "passthrough" processed photo is one that's just a bracket merge or a
  // RAW→JPEG conversion — no AI applied yet, so it should appear in Stage 2.
  function isMerePassthrough(p: Photo): boolean {
    return p.is_hdr === true && p.ai_provider === 'oceano-enhance';
  }

  // EXIF cache for filename-only bracket detection fallback.
  const [exifByPhoto, setExifByPhoto] = useState<Record<string, ExifSnapshot>>({});

  const { brackets, singles } = useMemo(() => {
    const base = groupPhotosIntoBrackets(rawPhotos);
    return applyExifGrouping(base, exifByPhoto);
  }, [rawPhotos, exifByPhoto]);

  // Lazy EXIF reads for the secondary bracket pass.
  useEffect(() => {
    const baseGroup = groupPhotosIntoBrackets(rawPhotos);
    const candidates = baseGroup.singles.filter(
      (p) => !isRawFilename(p.filename) && exifByPhoto[p.id] === undefined && photoUrls[p.id]
    );
    if (candidates.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const p of candidates) {
        const url = photoUrls[p.id];
        if (!url) continue;
        const snap = await readExifFromUrl(url, p.filename);
        if (cancelled) return;
        setExifByPhoto((prev) => ({
          ...prev,
          [p.id]: snap ?? { takenAt: null, exposureBias: null },
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawPhotos, photoUrls, exifByPhoto]);

  // Stage 2 inputs: merged JPEGs (bracket merges) + singles that have been
  // JPEG-converted already, EXCLUDING anything that's already been AI-enhanced.
  const stage2Inputs = useMemo(() => {
    const mergedJpegs = processedPhotos.filter(
      (p) => isMerePassthrough(p) && !hasEnhanceChild(p.id)
    );
    const jpegSingles = singles.filter(
      (s) => !isRawFilename(s.filename) && !hasEnhanceChild(s.id)
    );
    return [...mergedJpegs, ...jpegSingles];
  }, [processedPhotos, singles, childrenByParent]);

  // Stage 3 photos: AI-enhanced outputs (not pure bracket merges).
  const stage3Photos = useMemo(
    () => processedPhotos.filter((p) => !isMerePassthrough(p)),
    [processedPhotos]
  );

  // Auto-advance stage on first load (or after a refresh that surfaces new work).
  useEffect(() => {
    if (stage3Photos.length > 0 && stage === 1 && brackets.length === 0 && singles.length === 0) {
      setStage(3);
    } else if (stage2Inputs.length > 0 && stage === 1 && brackets.length === 0) {
      setStage(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage2Inputs.length, stage3Photos.length, brackets.length, singles.length]);

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

  // ─── Stage 1: Approve & Merge ────────────────────────────────────────────
  // Two-phase: (1) for any RAW frame in a selected bracket, fire the ARW
  // worker to demosaic it to JPEG. The worker returns the new photo_id of the
  // sibling JPEG. (2) Once all frames are JPEG, fire the hdr_merge job using
  // those JPEG ids. This is done sequentially per bracket so the UI status
  // reads naturally and so we don't dog-pile the single-concurrency worker.
  async function runStage1ApproveMerge() {
    setRunning(true);
    setRunError(null);
    try {
      const approvedBrackets = brackets.filter((b) => selectedBrackets.has(b.id));
      for (const b of approvedBrackets) {
        // Phase 1 — ensure every frame is JPEG. Convert RAW frames in
        // parallel; the worker serializes internally with concurrency=1, but
        // firing in parallel lets us await one Promise.all.
        const jpegIds = await Promise.all(
          b.photos.map(async (p) => {
            if (!isRawFilename(p.filename)) return p.id;
            const r = await fetch('/api/photos/convert', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ photo_id: p.id }),
            });
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              throw new Error(j.error || `convert_failed_${r.status}`);
            }
            const data = await r.json();
            return data.photo_id as string;
          })
        );

        // Phase 2 — merge those JPEGs.
        const r = await fetch('/api/ai/process', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            order_id: orderId,
            job_type: 'hdr_merge',
            provider: 'oceano-enhance', // deterministic merge, no AI
            photo_ids: jpegIds,
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `merge_failed_${r.status}`);
        }
      }
      setSelectedBrackets(new Set());
      setStage(2);
      refresh();
    } catch (err: any) {
      setRunError(err?.message || 'failed');
    } finally {
      setRunning(false);
    }
  }

  // ─── Stage 2: Run AI ─────────────────────────────────────────────────────
  async function runStage2Enhance() {
    setRunning(true);
    setRunError(null);
    const targets =
      stage2Selection.size > 0
        ? stage2Inputs.filter((p) => stage2Selection.has(p.id))
        : stage2Inputs;
    try {
      for (const p of targets) {
        const r = await fetch('/api/ai/process', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            order_id: orderId,
            job_type: 'enhance_single',
            provider: aiProvider,
            photo_ids: [p.id],
            auto_chain_fixes: autoDetect,
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `enhance_failed_${r.status}`);
        }
      }
      setStage2Selection(new Set());
      setStage(3);
      refresh();
    } catch (err: any) {
      setRunError(err?.message || 'failed');
    } finally {
      setRunning(false);
    }
  }

  // Stage 1 selection helpers
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
  function selectAllBrackets() {
    setSelectedBrackets(new Set(brackets.map((b) => b.id)));
  }
  function clearBrackets() {
    setSelectedBrackets(new Set());
  }

  function toggleStage2(id: string) {
    setStage2Selection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Live job progress
  const inFlightJobs = useMemo(
    () => jobs.filter((j) => ['pending', 'queued', 'running'].includes(j.status)),
    [jobs]
  );

  return (
    <div className="space-y-6">
      {/* Upload zone */}
      <div
        {...getRootProps()}
        className={`rounded-lg border-2 border-dashed p-6 text-center transition cursor-pointer ${
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
          JPEG / PNG / TIFF / WebP run through AI directly. ARW / CR2 / NEF auto-convert via the worker.
        </p>
      </div>

      {/* Stepper */}
      <Stepper
        current={stage}
        onChange={setStage}
        counts={{
          1: brackets.length + singles.length,
          2: stage2Inputs.length,
          3: stage3Photos.length,
        }}
      />

      {/* In-flight progress */}
      {inFlightJobs.length > 0 && (
        <div className="card p-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-slate-700">
            <Loader2 className="h-4 w-4 animate-spin text-ocean-600" />
            {inFlightJobs.length} job{inFlightJobs.length === 1 ? '' : 's'} processing in the background.
          </div>
          <button
            onClick={refresh}
            className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      )}

      {/* Stage content */}
      {stage === 1 && (
        <Stage1
          brackets={brackets}
          singles={singles}
          selectedBrackets={selectedBrackets}
          selectedSingles={selectedSingles}
          onToggleBracket={toggleBracket}
          onToggleSingle={toggleSingle}
          onSelectAll={selectAllBrackets}
          onClear={clearBrackets}
          photoUrls={photoUrls}
          setPhotoUrls={setPhotoUrls}
          rawPhotos={rawPhotos}
          openViewer={(idx) => setViewer({ list: 'raw', index: idx })}
          onConverted={refresh}
          running={running}
          onApproveMerge={runStage1ApproveMerge}
          canSkipToStage2={stage2Inputs.length > 0}
          onSkip={() => setStage(2)}
        />
      )}

      {stage === 2 && (
        <Stage2
          inputs={stage2Inputs}
          selection={stage2Selection}
          onToggle={toggleStage2}
          provider={aiProvider}
          onProviderChange={setAiProvider}
          autoDetect={autoDetect}
          onAutoDetectChange={setAutoDetect}
          running={running}
          onRun={runStage2Enhance}
          onBack={() => setStage(1)}
          photoUrls={photoUrls}
          setPhotoUrls={setPhotoUrls}
        />
      )}

      {stage === 3 && (
        <Stage3
          photos={stage3Photos}
          photoUrls={photoUrls}
          setPhotoUrls={setPhotoUrls}
          openViewer={(idx) => setViewer({ list: 'processed', index: idx })}
          onChange={refresh}
          onBack={() => setStage(2)}
        />
      )}

      {runError && (
        <div className="card p-3 text-sm text-rose-700 bg-rose-50 border-rose-200">
          {runError}
        </div>
      )}

      {/* Empty state */}
      {brackets.length === 0 &&
        singles.length === 0 &&
        stage2Inputs.length === 0 &&
        stage3Photos.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-500">
            No photos yet. Drop your shoot above to begin.
          </div>
        )}

      {viewer && (
        <PhotoViewer
          photos={viewer.list === 'raw' ? rawPhotos : stage3Photos}
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

// ─── Stepper ─────────────────────────────────────────────────────────────────
function Stepper({
  current,
  onChange,
  counts,
}: {
  current: Stage;
  onChange: (s: Stage) => void;
  counts: Record<Stage, number>;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
      {([1, 2, 3] as Stage[]).map((s, i) => {
        const active = s === current;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
              active
                ? 'bg-ocean-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full grid place-items-center text-xs font-bold ${
                active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {s}
            </span>
            <span>{STAGE_TITLES[s]}</span>
            {counts[s] > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  active ? 'bg-white/20' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {counts[s]}
              </span>
            )}
            {i < 2 && <ChevronRight className="h-4 w-4 text-slate-400 ml-1" />}
          </button>
        );
      })}
    </div>
  );
}

// ─── Stage 1: Sort & Merge ───────────────────────────────────────────────────
function Stage1({
  brackets,
  singles,
  selectedBrackets,
  selectedSingles,
  onToggleBracket,
  onToggleSingle,
  onSelectAll,
  onClear,
  photoUrls,
  setPhotoUrls,
  rawPhotos,
  openViewer,
  onConverted,
  running,
  onApproveMerge,
  canSkipToStage2,
  onSkip,
}: {
  brackets: ReturnType<typeof groupPhotosIntoBrackets>['brackets'];
  singles: Photo[];
  selectedBrackets: Set<string>;
  selectedSingles: Set<string>;
  onToggleBracket: (id: string) => void;
  onToggleSingle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  photoUrls: Record<string, string | null>;
  setPhotoUrls: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  rawPhotos: Photo[];
  openViewer: (idx: number) => void;
  onConverted: () => void;
  running: boolean;
  onApproveMerge: () => void;
  canSkipToStage2: boolean;
  onSkip: () => void;
}) {
  const hasContent = brackets.length > 0 || singles.length > 0;
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ocean-900">Sort & Merge</h2>
          <p className="text-sm text-slate-500">
            Pick which bracket sets to approve. We&apos;ll merge them into clean JPEGs ready for AI.
            Singles get carried over automatically.
          </p>
        </div>
        {hasContent && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button onClick={onSelectAll} className="text-ocean-700 hover:text-ocean-900 font-medium">
              Select all brackets
            </button>
            <span>·</span>
            <button onClick={onClear} className="hover:text-slate-700">
              Clear
            </button>
          </div>
        )}
      </header>

      {brackets.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Bracket sets ({brackets.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {brackets.map((b) => (
              <BracketCard
                key={b.id}
                bracket={b}
                selected={selectedBrackets.has(b.id)}
                onToggle={() => onToggleBracket(b.id)}
                urls={photoUrls}
                setUrls={setPhotoUrls}
              />
            ))}
          </div>
        </section>
      )}

      {singles.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Singles ({singles.length}) — carried into Stage 2 automatically
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
            {singles.map((p) => (
              <SingleThumb
                key={p.id}
                photo={p}
                selected={selectedSingles.has(p.id)}
                onToggle={() => onToggleSingle(p.id)}
                onOpen={() => {
                  const idx = rawPhotos.findIndex((rp) => rp.id === p.id);
                  openViewer(Math.max(0, idx));
                }}
                urls={photoUrls}
                setUrls={setPhotoUrls}
                onConverted={onConverted}
              />
            ))}
          </div>
        </section>
      )}

      {hasContent && (
        <footer className="flex items-center justify-between border-t border-slate-200 pt-4">
          <div className="text-sm text-slate-600">
            {selectedBrackets.size > 0
              ? `${selectedBrackets.size} bracket${selectedBrackets.size === 1 ? '' : 's'} ready to merge`
              : 'Select bracket sets you want to merge'}
          </div>
          <div className="flex items-center gap-2">
            {canSkipToStage2 && (
              <button onClick={onSkip} className="btn-secondary text-sm">
                Skip to Stage 2
              </button>
            )}
            <button
              onClick={onApproveMerge}
              disabled={running || selectedBrackets.size === 0}
              className="btn-primary"
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Approve &amp; Merge {selectedBrackets.size > 0 ? selectedBrackets.size : ''}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

// ─── Stage 2: AI Enhance ─────────────────────────────────────────────────────
function Stage2({
  inputs,
  selection,
  onToggle,
  provider,
  onProviderChange,
  autoDetect,
  onAutoDetectChange,
  running,
  onRun,
  onBack,
  photoUrls,
  setPhotoUrls,
}: {
  inputs: Photo[];
  selection: Set<string>;
  onToggle: (id: string) => void;
  provider: AiProvider;
  onProviderChange: (p: AiProvider) => void;
  autoDetect: boolean;
  onAutoDetectChange: (b: boolean) => void;
  running: boolean;
  onRun: () => void;
  onBack: () => void;
  photoUrls: Record<string, string | null>;
  setPhotoUrls: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
}) {
  const targetCount = selection.size > 0 ? selection.size : inputs.length;
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ocean-900">AI Enhance</h2>
          <p className="text-sm text-slate-500">
            Run the luxury real estate prompt on your merged photos. Auto-detect chains
            sky and window fixes when needed.
          </p>
        </div>
        <button onClick={onBack} className="text-xs text-slate-500 hover:text-slate-700">
          ← Back to Sort
        </button>
      </header>

      {inputs.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          Nothing ready to enhance yet. Approve some brackets in Stage 1 first.
        </div>
      ) : (
        <>
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              Ready to enhance ({inputs.length})
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {inputs.map((p) => (
                <Stage2Thumb
                  key={p.id}
                  photo={p}
                  selected={selection.has(p.id)}
                  onToggle={() => onToggle(p.id)}
                  urls={photoUrls}
                  setUrls={setPhotoUrls}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Click a photo to limit the run to a subset. Leave all unselected to run on every photo.
            </p>
          </section>

          <section className="card p-4 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                AI Provider
              </label>
              <select
                className="input mt-1"
                value={provider}
                onChange={(e) => onProviderChange(e.target.value as AiProvider)}
              >
                <option value="openai-gpt-image">GPT Image 2 (recommended)</option>
                <option value="gemini-banana-pro">Nano Banana Pro (Gemini)</option>
                <option value="oceano-enhance">Oceano Smart Enhance</option>
                <option value="auto">Auto pick</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Auto-detect fixes
              </label>
              <label className="mt-1 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDetect}
                  onChange={(e) => onAutoDetectChange(e.target.checked)}
                  className="h-4 w-4 rounded accent-ocean-600"
                />
                <span className="text-sm text-slate-700">
                  Auto-apply sky / window fixes when detected
                </span>
              </label>
            </div>
            <button
              onClick={onRun}
              disabled={running || inputs.length === 0}
              className="btn-primary"
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Run AI on {targetCount} {targetCount === 1 ? 'photo' : 'photos'}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function Stage2Thumb({
  photo,
  selected,
  onToggle,
  urls,
  setUrls,
}: {
  photo: Photo;
  selected: boolean;
  onToggle: () => void;
  urls: Record<string, string | null>;
  setUrls: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
}) {
  const url = urls[photo.id];
  useEffect(() => {
    if (url !== undefined) return;
    fetch(`/api/photo-url?photo_id=${photo.id}`)
      .then((r) => r.json())
      .then((d) => setUrls((u) => ({ ...u, [photo.id]: d.url ?? null })))
      .catch(() => setUrls((u) => ({ ...u, [photo.id]: null })));
  }, [photo.id, url, setUrls]);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative aspect-[3/2] overflow-hidden rounded-md ring-2 transition ${
        selected ? 'ring-ocean-600' : 'ring-transparent hover:ring-slate-300'
      }`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.filename} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-slate-100 grid place-items-center text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      <div
        className={`absolute top-1.5 left-1.5 h-5 w-5 grid place-items-center rounded border-2 text-[11px] ${
          selected ? 'bg-ocean-600 border-ocean-600 text-white' : 'bg-white/90 border-white/90 text-transparent'
        }`}
      >
        ✓
      </div>
      {photo.is_hdr && (
        <div className="absolute top-1.5 right-1.5 text-[10px] font-semibold bg-amber-500/90 text-amber-950 px-1.5 py-0.5 rounded">
          Merged
        </div>
      )}
    </button>
  );
}

// ─── Stage 3: Review & Edit ──────────────────────────────────────────────────
function Stage3({
  photos,
  photoUrls,
  setPhotoUrls,
  openViewer,
  onChange,
  onBack,
}: {
  photos: Photo[];
  photoUrls: Record<string, string | null>;
  setPhotoUrls: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  openViewer: (idx: number) => void;
  onChange: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ocean-900">Review & Edit</h2>
          <p className="text-sm text-slate-500">
            Approve your final picks. Hover any photo for extra edits like sky, window,
            twilight, virtual furniture, or object removal.
          </p>
        </div>
        <button onClick={onBack} className="text-xs text-slate-500 hover:text-slate-700">
          ← Back to AI Enhance
        </button>
      </header>

      {photos.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          Nothing AI-processed yet. Run Stage 2 first.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((p, i) => (
            <ProcessedCard
              key={p.id}
              photo={p}
              onOpen={() => openViewer(i)}
              urls={photoUrls}
              setUrls={setPhotoUrls}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single thumbnail card (Stage 1) ────────────────────────────────────────
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
    </div>
  );
}

// ─── Processed photo card (Stage 3) with full chip strip ────────────────────
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
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (url !== undefined) return;
    fetch(`/api/photo-url?photo_id=${photo.id}`)
      .then((r) => r.json())
      .then((d) => setUrls((u) => ({ ...u, [photo.id]: d.url ?? null })))
      .catch(() => setUrls((u) => ({ ...u, [photo.id]: null })));
  }, [photo.id, url, setUrls]);

  async function decide(decision: 'approve' | 'reject' | 'reset') {
    setBusy(decision);
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

  async function applyExtra(jobType: AiJobType) {
    setBusy(jobType);
    try {
      await fetch('/api/ai/process', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          order_id: photo.order_id,
          job_type: jobType,
          provider: 'auto',
          photo_ids: [photo.id],
        }),
      });
      onChange();
    } finally {
      setBusy(null);
    }
  }

  const isApproved = photo.is_selected === true;
  const isRejected = photo.is_selected === false;

  // Compact chip strip for additional edits (Stage 3 power tools).
  const extraEdits: Array<{ id: AiJobType; label: string; icon: any }> = [
    { id: 'sky_replace', label: 'Sky', icon: Sun },
    { id: 'window_pull', label: 'Window', icon: Square },
    { id: 'twilight_convert', label: 'Twilight', icon: MoonStar },
    { id: 'lawn_enhance', label: 'Lawn', icon: Trees },
    { id: 'virtual_stage', label: 'Furniture', icon: Sofa },
    { id: 'declutter', label: 'Declutter', icon: Eraser },
  ];

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

      {isApproved && (
        <div className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-600 text-white px-1.5 py-0.5 rounded shadow">
          <CheckCircle2 className="h-3 w-3" /> Approved
        </div>
      )}

      {/* Bottom action area: approve/reject + chips */}
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-2 opacity-0 group-hover:opacity-100 transition"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex gap-1">
            <button
              onClick={() => decide(isApproved ? 'reset' : 'approve')}
              disabled={busy !== null}
              title={isApproved ? 'Un-approve' : 'Approve'}
              className={`p-1.5 rounded-md text-white text-xs transition ${
                isApproved ? 'bg-emerald-600' : 'bg-white/15 hover:bg-emerald-600'
              }`}
            >
              {busy === 'approve' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ThumbsUp className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={() => decide(isRejected ? 'reset' : 'reject')}
              disabled={busy !== null}
              title={isRejected ? 'Un-reject' : 'Reject'}
              className={`p-1.5 rounded-md text-white text-xs transition ${
                isRejected ? 'bg-rose-600' : 'bg-white/15 hover:bg-rose-600'
              }`}
            >
              {busy === 'reject' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ThumbsDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <button
            onClick={() => applyExtra('enhance_single')}
            disabled={busy !== null}
            title="Re-run enhance"
            className="p-1.5 rounded-md bg-white/15 text-white text-xs hover:bg-ocean-600 transition"
          >
            {busy === 'enhance_single' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {extraEdits.map((e) => {
            const Icon = e.icon;
            return (
              <button
                key={e.id}
                onClick={() => applyExtra(e.id)}
                disabled={busy !== null}
                title={e.label}
                className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium bg-white/15 text-white hover:bg-white/25 transition"
              >
                {busy === e.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
                {e.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
