'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Copy,
  ShieldCheck,
  Archive,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AiJobType, Photo } from '@/lib/supabase/database.types';
import { describeRecipe } from '@/lib/ai/recipe';
import { PhotoViewer } from './PhotoViewer';
import { BracketCard } from './BracketCard';
import { tusUpload, RESUMABLE_THRESHOLD_BYTES } from '@/lib/storage/tus-upload';
import {
  groupPhotosIntoBrackets,
  groupWithExif,
  isRawFilename,
  readExifFromUrl,
  type ExifSnapshot,
} from '@/lib/photos/bracket-grouping';
import { extractUploadExif } from '@/lib/photos/exif-extract';
import { compressImageFile } from '@/lib/photos/compress-image';
import { extractRawForUpload } from '@/lib/photos/raw-preview';
import { groupByRoom } from '@/lib/photos/rooms';
import { useInView } from '@/lib/hooks/use-in-view';
import { EmptyState } from '@/components/ui/EmptyState';

interface JobView {
  id: string;
  job_type: string;
  provider: string;
  status: string;
  cost_cents: number | null;
  duration_ms: number | null;
  error_message: string | null;
  input_photo_ids?: string[] | null;
  created_at?: string;
}

// Friendly labels for the in-flight placeholder cards in Review & Edit.
const JOB_LABEL: Record<string, string> = {
  enhance_single: 'Enhancing',
  hdr_merge: 'Merging brackets',
  sky_replace: 'Replacing sky',
  window_pull: 'Pulling windows',
  twilight_convert: 'Twilight convert',
  lawn_enhance: 'Greening lawn',
  virtual_stage: 'Staging',
  declutter: 'Decluttering',
};

const PROVIDER_SHORT: Record<string, string> = {
  'openai-gpt-image': 'GPT Image 2.0',
  'gemini-nano-banana-2': 'Nano Banana 2',
  'gemini-nano-banana-pro': 'Nano Banana Pro',
  'gemini-banana-pro': 'Nano Banana Pro',
  'oceano-enhance': 'Oceano Enhance',
  autoenhance: 'Autoenhance.ai',
};

type Stage = 1 | 2 | 3;
type AiProvider =
  | 'openai-gpt-image'
  | 'gemini-nano-banana-2'
  | 'gemini-nano-banana-pro'
  | 'oceano-enhance'
  | 'auto';

// Listing enhance preferences that shape the enhance prompt.
type SkyStyle = 'original' | 'sunny_puffs' | 'loaded_puffs' | 'crisp_streaks' | 'clear_fade';
type EnhancementStyle = 'signature' | 'natural';

const SKY_OPTIONS: Array<{ value: SkyStyle; label: string }> = [
  { value: 'original', label: 'Original (keep sky)' },
  { value: 'sunny_puffs', label: 'Sunny puffs' },
  { value: 'loaded_puffs', label: 'Loaded puffs' },
  { value: 'crisp_streaks', label: 'Crisp streaks' },
  { value: 'clear_fade', label: 'Clear fade' },
];

const STAGE_TITLES: Record<Stage, string> = {
  1: 'Sort & Merge',
  2: 'AI Enhance',
  3: 'Review & Edit',
};

export function PhotoManager({
  orderId,
  autoEnhanceOnUpload = true,
}: {
  orderId: string;
  autoEnhanceOnUpload?: boolean;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [uploading, setUploading] = useState(false);
  // Compress browser-decodable images to web quality before upload (much faster;
  // RAW/TIFF are untouched). The pipeline already works from JPEG.
  // Default OFF: upload full-size originals so the merge/enhance runs on full
  // resolution. Operators can opt back into compression for a faster upload.
  const [compressUploads, setCompressUploads] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({});
  const [viewer, setViewer] = useState<{ list: 'raw' | 'processed'; index: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>(1);
  // Live progress for the Approve & Merge step (RAW conversion can be slow).
  const [mergeProgress, setMergeProgress] = useState<
    { phase: 'convert' | 'merge'; done: number; total: number; brackets: number } | null
  >(null);

  // Stage 1 selection
  const [selectedBrackets, setSelectedBrackets] = useState<Set<string>>(new Set());
  const [selectedSingles, setSelectedSingles] = useState<Set<string>>(new Set());
  // Bracketing method: Auto-detect, or force a fixed Count (3/5/7).
  const [bracketCount, setBracketCount] = useState<'auto' | 3 | 5 | 7>('auto');

  // Stage 2 config. Default to the deterministic edit engine (the faithful
  // fuse + grade we tune) rather than a paid generative model — that's the
  // reliable "one look" path; generative providers stay available in the dropdown.
  const [aiProvider, setAiProvider] = useState<AiProvider>('oceano-enhance');
  // Off by default: the signature enhance should NOT auto-apply sky / window /
  // lawn / declutter / twilight. Those alter content and stay opt-in per photo.
  const [autoDetect, setAutoDetect] = useState(false);
  const [stage2Selection, setStage2Selection] = useState<Set<string>>(new Set());

  // Stage 2 enhance preferences. Defaults match the
  // signature luxury finish: full-strength edit, keep the real sky unless a
  // preset is chosen, recover blown windows, straighten verticals.
  const [enhancementStyle, setEnhancementStyle] = useState<EnhancementStyle>('signature');
  const [skyStyle, setSkyStyle] = useState<SkyStyle>('original');
  const [windowPull, setWindowPull] = useState(true);
  const [perspectiveCorrection, setPerspectiveCorrection] = useState(true);
  const [removeReflections, setRemoveReflections] = useState(true);
  const [blurFaces, setBlurFaces] = useState(false);

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
  // Raw photos that were already consumed by an HDR merge (any non-failed
  // hdr_merge job's inputs). Once a frame is merged it must NOT reappear as a
  // bracket/single or get re-carried into Stage 2 — that was the source of the
  // duplicate JPEGs piling into AI Enhance.
  const mergedSourceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const j of jobs) {
      if (j.job_type !== 'hdr_merge' || j.status === 'failed') continue;
      for (const id of j.input_photo_ids ?? []) ids.add(id);
    }
    return ids;
  }, [jobs]);

  const rawPhotos = useMemo(() => {
    const all = photos.filter((p) => p.kind === 'raw');
    const replacedArwIds = new Set<string>();
    for (const p of all) {
      if (p.parent_photo_id && !isRawFilename(p.filename)) {
        // This JPEG was converted from p.parent_photo_id — hide the ARW.
        replacedArwIds.add(p.parent_photo_id);
      }
    }
    // Collapse duplicate conversions: a flaky/concurrent convert can leave more
    // than one JPEG sibling per source ARW. Duplicates carry the same sequence
    // number, which shatters consecutive-run bracket detection and dumps frames
    // into "Singles". Keep exactly one converted JPEG per parent.
    const seenParent = new Set<string>();
    const out: Photo[] = [];
    for (const p of all) {
      if (replacedArwIds.has(p.id) || mergedSourceIds.has(p.id)) continue;
      if (p.parent_photo_id && !isRawFilename(p.filename)) {
        if (seenParent.has(p.parent_photo_id)) continue;
        seenParent.add(p.parent_photo_id);
      }
      out.push(p);
    }
    return out;
  }, [photos, mergedSourceIds]);
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

  // ─── Eager RAW conversion ──────────────────────────────────────────────
  // Convert ARW/DNG frames to JPEG in the background as soon as they exist,
  // instead of making Approve & Merge pay the slow, serialized conversion
  // cost. /api/raw-convert is idempotent, so the merge step later just picks
  // up the finished JPEGs instantly.
  const [bgConvert, setBgConvert] = useState<{ done: number; total: number } | null>(null);
  const bgAttempted = useRef<Set<string>>(new Set());
  const bgRunning = useRef(false);

  useEffect(() => {
    if (uploading || bgRunning.current) return;
    // rawPhotos already excludes ARWs that have a converted JPEG sibling.
    const targets = rawPhotos.filter(
      (p) => isRawFilename(p.filename) && !bgAttempted.current.has(p.id)
    );
    if (targets.length === 0) return;
    bgRunning.current = true;
    targets.forEach((p) => bgAttempted.current.add(p.id));
    let done = 0;
    setBgConvert({ done: 0, total: targets.length });

    const queue = targets.slice();
    async function bgWorker() {
      while (queue.length) {
        const p = queue.shift();
        if (!p) return;
        try {
          await fetch('/api/raw-convert', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ photo_id: p.id }),
          });
        } catch {
          // Background pass — Approve & Merge retries with real error surfacing.
        }
        done += 1;
        setBgConvert({ done, total: targets.length });
        refresh(); // swap each ARW card for its JPEG as it lands
      }
    }
    // Run several lanes so the worker's parallel convert slots stay full (it now
    // converts preview-first, so a batch finishes far faster).
    Promise.all(Array.from({ length: 4 }, () => bgWorker())).finally(() => {
      bgRunning.current = false;
      setBgConvert(null);
      refresh();
    });
  }, [rawPhotos, uploading, refresh]);

  // EXIF cache for filename-only bracket detection fallback.
  const [exifByPhoto, setExifByPhoto] = useState<Record<string, ExifSnapshot>>({});

  // EXIF persisted on each photo row at upload (ExposureBiasValue +
  // DateTimeOriginal). This is the authoritative source for telling brackets
  // from in-sequence detail singles; the lazy URL-based reads below are a
  // fallback for older photos uploaded before EXIF was stored.
  const storedExif = useMemo(() => {
    // Read EXIF off every photo row by id (own EXIF).
    const own: Record<string, { ev: number | null; t: number | null }> = {};
    for (const p of photos) {
      const e = (p.exif ?? {}) as any;
      const ev = typeof e.ExposureBiasValue === 'number' ? e.ExposureBiasValue : null;
      const parsed = e.DateTimeOriginal ? Date.parse(e.DateTimeOriginal) : NaN;
      own[p.id] = { ev, t: Number.isNaN(parsed) ? null : parsed };
    }
    // Map onto the surfaced frames. A worker-converted JPEG carries no EXIF, so
    // fall back to its source ARW's EXIF (parent_photo_id).
    const m: Record<string, ExifSnapshot> = {};
    for (const p of rawPhotos) {
      let ev = own[p.id]?.ev ?? null;
      let t = own[p.id]?.t ?? null;
      const parent = (p as any).parent_photo_id as string | null;
      if (parent && own[parent]) {
        if (ev === null) ev = own[parent].ev;
        if (t === null) t = own[parent].t;
      }
      if (ev !== null || t !== null) m[p.id] = { takenAt: t, exposureBias: ev };
    }
    return m;
  }, [photos, rawPhotos]);

  const { brackets, singles } = useMemo(() => {
    // A fixed Count is authoritative — chunk runs by N and skip the EXIF guess.
    if (bracketCount !== 'auto') {
      return groupPhotosIntoBrackets(rawPhotos, { fixedSize: bracketCount });
    }
    // EXIF-aware: segment each consecutive run by the exposure-bias cycle, which
    // separates brackets from interspersed detail singles. Runs without complete
    // EXIF fall back to filename chunking inside groupWithExif.
    const exif = { ...exifByPhoto, ...storedExif }; // stored wins
    return groupWithExif(rawPhotos, exif);
  }, [rawPhotos, exifByPhoto, storedExif, bracketCount]);

  // Backfill EXIF server-side when surfaced frames are missing exposure bias
  // (older orders, or RAW the browser couldn't read). Fires once; refreshes so
  // the grouping above re-runs with real exposure data.
  const exifBackfillRef = useRef(false);
  useEffect(() => {
    if (exifBackfillRef.current || rawPhotos.length === 0) return;
    const missing = rawPhotos.some((p) => typeof storedExif[p.id]?.exposureBias !== 'number');
    if (!missing) return;
    exifBackfillRef.current = true;
    fetch('/api/photos/extract-exif', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_id: orderId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.updated) refresh();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPhotos, storedExif, orderId]);

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
  // With auto-enhance on, the manual Stage 2 ("Run AI") is skipped entirely:
  // once triage is done, work flows straight to Review while enhancing happens
  // automatically in the background.
  useEffect(() => {
    if (stage !== 1 || brackets.length > 0) return;
    if (autoEnhanceOnUpload) {
      if (stage3Photos.length > 0 || stage2Inputs.length > 0) setStage(3);
    } else if (stage3Photos.length > 0 && singles.length === 0) {
      setStage(3);
    } else if (stage2Inputs.length > 0) {
      setStage(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage2Inputs.length, stage3Photos.length, brackets.length, singles.length, autoEnhanceOnUpload]);

  // Auto-enhance on upload — standalone singles. Whenever auto-enhance is on and
  // there are eligible JPEG singles (not bracket frames, not already enhanced),
  // kick the signature enhance. The endpoint is idempotent + dedupe-safe, so this
  // can fire on load, after a merge, or when more singles are added without ever
  // double-spending. Merged HDR bases are auto-enhanced server-side by the runner.
  // Keyed on the eligible-set signature so it kicks once per distinct set.
  const autoEnhanceTriedRef = useRef<string>('');
  useEffect(() => {
    if (!autoEnhanceOnUpload) return;
    const eligible = singles
      .filter((s) => !isRawFilename(s.filename) && !hasEnhanceChild(s.id))
      .map((s) => s.id)
      .sort();
    if (eligible.length === 0) return;
    const sig = eligible.join(',');
    if (autoEnhanceTriedRef.current === sig) return;
    autoEnhanceTriedRef.current = sig;
    fetch('/api/ai/auto-enhance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_id: orderId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.queued?.length) refresh();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEnhanceOnUpload, singles, childrenByParent, orderId]);

  // ─── Upload ──────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setUploading(true);
      setRunError(null);
      setUploadProgress({ done: 0, total: files.length });

      const supabase = createClient();
      // Upload several files at once. Direct-to-storage + fresh-token-per-chunk
      // make higher parallelism safe; this is the main throughput lever.
      const concurrency = 6;
      type RegItem = {
        photo_id: string;
        filename: string;
        storage_path: string;
        raw_storage_path?: string;
        mime_type: string;
        byte_size: number;
        width?: number;
        height?: number;
        exif?: Record<string, unknown>;
      };
      const registered: RegItem[] = [];
      // EXIF parsing runs off the critical path so a worker can start the next
      // file immediately; all parses are awaited before register.
      const exifJobs: Promise<void>[] = [];

      let done = 0;
      let aborted = false;

      async function uploadOne(original: File) {
        if (aborted) return;
        const photoId = crypto.randomUUID();

        // RAW: upload the camera's embedded full-size JPEG preview (~6MB) instead
        // of the 50MB original — the big upload-speed + storage win — and read
        // exposure bias straight from the RAW header (the browser's exifr drops
        // it on Sony ARW). Falls back to the original RAW when there's no usable
        // preview, in which case the worker converts + backfills bias as before.
        // Decodable non-RAW images are compressed to web quality.
        let file: File;
        let presetExif: Record<string, unknown> | null = null;
        let dims: { width: number; height: number } | null = null;
        // When we upload a JPEG preview for display, also keep the RAW original
        // for full-quality processing (libraw decode in the edit engine).
        let rawOriginal: File | null = null;
        if (isRawFilename(original.name)) {
          const prev = await extractRawForUpload(original).catch(() => null);
          if (prev) {
            file = prev.file;
            rawOriginal = original; // upload alongside the preview for the engine
            dims = { width: prev.width, height: prev.height };
            presetExif = {};
            if (typeof prev.exif.ExposureBiasValue === 'number') presetExif.ExposureBiasValue = prev.exif.ExposureBiasValue;
            if (prev.exif.DateTimeOriginal) presetExif.DateTimeOriginal = prev.exif.DateTimeOriginal;
            if (prev.exif.Make) presetExif.Make = prev.exif.Make;
            if (prev.exif.Model) presetExif.Model = prev.exif.Model;
          } else {
            file = original; // no usable preview → the raw original IS storage_path
          }
        } else {
          file = compressUploads ? await compressImageFile(original) : original;
        }

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

        // Upload the RAW original alongside the preview (always resumable — it's
        // large). The engine processes from this; display keeps using the preview.
        let rawStoragePath: string | undefined;
        if (rawOriginal) {
          const safeRawName = rawOriginal.name.replace(/[^\w.\-]+/g, '_');
          rawStoragePath = `${orderId}/${photoId}-raw-${safeRawName}`;
          try {
            await tusUpload({
              file: rawOriginal,
              bucket: 'raw-photos',
              objectName: rawStoragePath,
              contentType: rawOriginal.type || 'application/octet-stream',
            });
          } catch (err: any) {
            // The preview is already up, so the photo still works for display +
            // preview-based processing. Skip the RAW rather than fail the upload.
            rawStoragePath = undefined;
          }
        }

        const entry: RegItem = {
          photo_id: photoId,
          filename: file.name,
          storage_path: storagePath,
          mime_type: contentType,
          byte_size: file.size,
        };
        if (rawStoragePath) entry.raw_storage_path = rawStoragePath;
        if (dims) {
          entry.width = dims.width;
          entry.height = dims.height;
        }
        registered.push(entry);
        if (presetExif) {
          // Exposure bias already read from the RAW header — no background job.
          if (Object.keys(presetExif).length) entry.exif = presetExif;
        } else {
          // Extract bracket-relevant EXIF in the background (so detection can
          // tell HDR sets from in-sequence detail singles).
          exifJobs.push(
            extractUploadExif(original)
              .then((exif) => {
                if (Object.keys(exif).length) entry.exif = exif as Record<string, unknown>;
              })
              .catch(() => {})
          );
        }
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

      // Make sure EXIF is attached before registering.
      await Promise.all(exifJobs);

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
    const approvedBrackets = brackets.filter((b) => selectedBrackets.has(b.id));
    const totalRaw = approvedBrackets.reduce(
      (n, b) => n + b.photos.filter((p) => isRawFilename(p.filename)).length,
      0
    );
    let convertedCount = 0;
    setMergeProgress(
      totalRaw > 0
        ? { phase: 'convert', done: 0, total: totalRaw, brackets: approvedBrackets.length }
        : { phase: 'merge', done: 0, total: approvedBrackets.length, brackets: approvedBrackets.length }
    );
    try {
      let bracketIdx = 0;
      for (const b of approvedBrackets) {
        // Phase 1 — ensure every frame is JPEG. Convert RAW frames in
        // parallel; the worker serializes internally with concurrency=1, but
        // firing in parallel lets us await one Promise.all.
        const jpegIds = await Promise.all(
          b.photos.map(async (p) => {
            if (!isRawFilename(p.filename)) return p.id;
            // A gateway 504 just means the worker is still decoding — it keeps
            // going in the background and the route is idempotent, so retries
            // pick up the finished JPEG. Retry with growing waits before failing.
            let lastErr = '';
            const waits = [4000, 8000, 12000];
            for (let attempt = 0; attempt <= waits.length; attempt++) {
              const r = await fetch('/api/raw-convert', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ photo_id: p.id }),
              });
              if (r.ok) {
                const data = await r.json();
                convertedCount += 1;
                setMergeProgress({ phase: 'convert', done: convertedCount, total: totalRaw, brackets: approvedBrackets.length });
                return data.photo_id as string;
              }
              const j = await r.json().catch(() => ({}));
              lastErr = j.error || `convert_failed_${r.status}`;
              if (attempt < waits.length) await new Promise((res) => setTimeout(res, waits[attempt]));
            }
            throw new Error(lastErr);
          })
        );

        // Phase 2 — merge those JPEGs.
        bracketIdx += 1;
        setMergeProgress({ phase: 'merge', done: bracketIdx, total: approvedBrackets.length, brackets: approvedBrackets.length });
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
      // With auto-enhance on, merged bases enhance themselves (runner) — skip the
      // manual Run AI step and go straight to Review. Otherwise land on Stage 2.
      setStage(autoEnhanceOnUpload ? 3 : 2);
      refresh();
    } catch (err: any) {
      setRunError(err?.message || 'failed');
    } finally {
      setRunning(false);
      setMergeProgress(null);
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
            enhancement_style: enhancementStyle,
            sky_style: skyStyle,
            window_pull: windowPull,
            perspective_correction: perspectiveCorrection,
            remove_reflections: removeReflections,
            blur_faces: blurFaces,
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

  // Failures from the last 30 minutes — surfaced in Review & Edit so a job that
  // errors doesn't just silently never appear.
  const recentFailedJobs = useMemo(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    return jobs.filter(
      (j) => j.status === 'failed' && j.created_at && new Date(j.created_at).getTime() > cutoff
    );
  }, [jobs]);

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

      <label
        className="flex items-center gap-2 text-xs text-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={compressUploads}
          disabled={uploading}
          onChange={(e) => setCompressUploads(e.target.checked)}
          className="h-3.5 w-3.5 rounded accent-ocean-600"
        />
        <span>
          Compress before upload — faster, slightly lower quality.{' '}
          <span className="text-slate-400">
            Off by default (full-size). When on, shrinks JPEG/PNG/WebP to ≤6144px;
            RAW &amp; TIFF upload untouched.
          </span>
        </span>
      </label>

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

      {/* Background RAW preparation */}
      {bgConvert && !mergeProgress && (
        <div className="card p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Loader2 className="h-4 w-4 animate-spin text-ocean-600" />
            <span>
              Preparing RAW files — {bgConvert.done}/{bgConvert.total} converted to JPEG in the background.
              <span className="text-slate-400"> Keep sorting; Approve &amp; Merge will be fast once this finishes.</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-ocean-500 transition-all"
              style={{ width: `${Math.round((bgConvert.total ? bgConvert.done / bgConvert.total : 0) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Approve & Merge progress (RAW conversion is the slow part) */}
      {mergeProgress && (
        <div className="card p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Loader2 className="h-4 w-4 animate-spin text-ocean-600" />
            {mergeProgress.phase === 'convert' ? (
              <span>
                Converting RAW frames to JPEG — {mergeProgress.done}/{mergeProgress.total}
                <span className="text-slate-400"> · each ARW is a full decode on the worker (~5–15s)</span>
              </span>
            ) : (
              <span>
                Merging brackets — {mergeProgress.done}/{mergeProgress.total}
              </span>
            )}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-ocean-500 transition-all"
              style={{
                width: `${Math.round(
                  (mergeProgress.total ? mergeProgress.done / mergeProgress.total : 0) * 100
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* In-flight progress */}
      {inFlightJobs.length > 0 && (
        <div className="card p-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-slate-700">
            <Loader2 className="h-4 w-4 animate-spin text-ocean-600" />
            {inFlightJobs.length} photo{inFlightJobs.length === 1 ? '' : 's'} processing — results land in
            Review &amp; Edit as each finishes (~30–60s per photo).
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
          onSkip={() => setStage(autoEnhanceOnUpload ? 3 : 2)}
          bracketCount={bracketCount}
          onBracketCountChange={setBracketCount}
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
          enhancementStyle={enhancementStyle}
          onEnhancementStyleChange={setEnhancementStyle}
          skyStyle={skyStyle}
          onSkyStyleChange={setSkyStyle}
          windowPull={windowPull}
          onWindowPullChange={setWindowPull}
          perspectiveCorrection={perspectiveCorrection}
          onPerspectiveCorrectionChange={setPerspectiveCorrection}
          removeReflections={removeReflections}
          onRemoveReflectionsChange={setRemoveReflections}
          blurFaces={blurFaces}
          onBlurFacesChange={setBlurFaces}
          running={running}
          onRun={runStage2Enhance}
          onBack={() => setStage(1)}
          autoEnhanceOnUpload={autoEnhanceOnUpload}
          onGoToReview={() => setStage(3)}
          photoUrls={photoUrls}
          setPhotoUrls={setPhotoUrls}
        />
      )}

      {stage === 3 && (
        <Stage3
          orderId={orderId}
          photos={stage3Photos}
          processingJobs={inFlightJobs}
          failedJobs={recentFailedJobs}
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
  bracketCount,
  onBracketCountChange,
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
  bracketCount: 'auto' | 3 | 5 | 7;
  onBracketCountChange: (c: 'auto' | 3 | 5 | 7) => void;
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
        <div className="flex flex-col items-end gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-medium uppercase tracking-wide">Bracketing</span>
            <select
              className="input py-1 text-sm"
              value={String(bracketCount)}
              onChange={(e) =>
                onBracketCountChange(e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as 3 | 5 | 7))
              }
            >
              <option value="auto">Auto-detect</option>
              <option value="3">Count: 3-shot</option>
              <option value="5">Count: 5-shot</option>
              <option value="7">Count: 7-shot</option>
            </select>
          </label>
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
        </div>
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
  enhancementStyle,
  onEnhancementStyleChange,
  skyStyle,
  onSkyStyleChange,
  windowPull,
  onWindowPullChange,
  perspectiveCorrection,
  onPerspectiveCorrectionChange,
  removeReflections,
  onRemoveReflectionsChange,
  blurFaces,
  onBlurFacesChange,
  running,
  onRun,
  onBack,
  autoEnhanceOnUpload,
  onGoToReview,
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
  enhancementStyle: EnhancementStyle;
  onEnhancementStyleChange: (s: EnhancementStyle) => void;
  skyStyle: SkyStyle;
  onSkyStyleChange: (s: SkyStyle) => void;
  windowPull: boolean;
  onWindowPullChange: (b: boolean) => void;
  perspectiveCorrection: boolean;
  onPerspectiveCorrectionChange: (b: boolean) => void;
  removeReflections: boolean;
  onRemoveReflectionsChange: (b: boolean) => void;
  blurFaces: boolean;
  onBlurFacesChange: (b: boolean) => void;
  running: boolean;
  onRun: () => void;
  onBack: () => void;
  autoEnhanceOnUpload: boolean;
  onGoToReview: () => void;
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
            {!autoEnhanceOnUpload && (
              <p className="mt-2 text-xs text-slate-500">
                Click a photo to limit the run to a subset. Leave all unselected to run on every photo.
              </p>
            )}
          </section>

          {autoEnhanceOnUpload && (
            <section className="card p-4 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-ocean-100 text-ocean-700 grid place-items-center shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Auto-enhancing these photos</div>
                  <p className="text-xs text-slate-500 mt-0.5 max-w-prose">
                    Auto-enhance on upload is on, so each base runs the signature enhance (plus
                    scene fixes) automatically — no Run AI needed. Photos move to Review as they
                    finish. Turn this off in Settings → Enhance to enhance manually.
                  </p>
                </div>
              </div>
              <button onClick={onGoToReview} className="btn-primary shrink-0">
                Go to review →
              </button>
            </section>
          )}

          {!autoEnhanceOnUpload && (
          <>
          <section className="card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Enhance preferences</h3>
              <span className="text-[11px] text-slate-400">Applied to this run</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Enhancement style
                </label>
                <select
                  className="input mt-1"
                  value={enhancementStyle}
                  onChange={(e) => onEnhancementStyleChange(e.target.value as EnhancementStyle)}
                >
                  <option value="signature">Signature (full luxury finish)</option>
                  <option value="natural">Natural (restrained)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Sky style
                </label>
                <select
                  className="input mt-1"
                  value={skyStyle}
                  onChange={(e) => onSkyStyleChange(e.target.value as SkyStyle)}
                >
                  {SKY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer sm:mt-5">
                <input
                  type="checkbox"
                  checked={windowPull}
                  onChange={(e) => onWindowPullChange(e.target.checked)}
                  className="h-4 w-4 rounded accent-ocean-600"
                />
                <span className="text-sm text-slate-700">Window pulls</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer sm:mt-5">
                <input
                  type="checkbox"
                  checked={perspectiveCorrection}
                  onChange={(e) => onPerspectiveCorrectionChange(e.target.checked)}
                  className="h-4 w-4 rounded accent-ocean-600"
                />
                <span className="text-sm text-slate-700">Perspective correction</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeReflections}
                  onChange={(e) => onRemoveReflectionsChange(e.target.checked)}
                  className="h-4 w-4 rounded accent-ocean-600"
                />
                <span className="text-sm text-slate-700">Remove camera reflections</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blurFaces}
                  onChange={(e) => onBlurFacesChange(e.target.checked)}
                  className="h-4 w-4 rounded accent-ocean-600"
                />
                <span className="text-sm text-slate-700">Blur faces in personal photos</span>
              </label>
            </div>
            <p className="text-[11px] text-slate-400">
              Whites stay neutral, the property is preserved exactly (MLS-accurate), and color is
              enhanced to the lux signature look. Reflection &amp; face-blur edits only affect those
              elements; sky replacement only runs on exteriors when a preset is chosen.
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
                <option value="openai-gpt-image">GPT Image 2.0 (default)</option>
                <option value="gemini-nano-banana-2">Nano Banana 2 (Gemini)</option>
                <option value="gemini-nano-banana-pro">Nano Banana Pro (Gemini)</option>
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
              Enhance {targetCount} {targetCount === 1 ? 'photo' : 'photos'}
            </button>
          </section>
          </>
          )}
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
  const { ref, inView } = useInView<HTMLButtonElement>();
  useEffect(() => {
    if (!inView) return;
    if (url !== undefined) return;
    fetch(`/api/photo-url?photo_id=${photo.id}&w=640`)
      .then((r) => r.json())
      .then((d) => setUrls((u) => ({ ...u, [photo.id]: d.url ?? null })))
      .catch(() => setUrls((u) => ({ ...u, [photo.id]: null })));
  }, [photo.id, url, setUrls, inView]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      className={`relative aspect-[3/2] overflow-hidden rounded-md ring-2 transition ${
        selected ? 'ring-ocean-600' : 'ring-transparent hover:ring-slate-300'
      }`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.filename} loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
  orderId,
  photos,
  processingJobs,
  failedJobs,
  photoUrls,
  setPhotoUrls,
  openViewer,
  onChange,
  onBack,
}: {
  orderId: string;
  photos: Photo[];
  processingJobs: JobView[];
  failedJobs: JobView[];
  photoUrls: Record<string, string | null>;
  setPhotoUrls: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  openViewer: (idx: number) => void;
  onChange: () => void;
  onBack: () => void;
}) {
  const [organizing, setOrganizing] = useState(false);
  const [organizeError, setOrganizeError] = useState<string | null>(null);
  const [byRoom, setByRoom] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const [dedupeResult, setDedupeResult] = useState<{ sets: number; deselected: number } | null>(null);
  const [dedupeError, setDedupeError] = useState<string | null>(null);
  const [qcRunning, setQcRunning] = useState(false);
  const [qcError, setQcError] = useState<string | null>(null);
  const [qcReport, setQcReport] = useState<{ summary: any; findings: any[] } | null>(null);

  async function runQcReview() {
    setQcRunning(true);
    setQcError(null);
    try {
      const r = await fetch('/api/ai/qc-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setQcError(data.message || data.error || `error_${r.status}`);
      } else {
        setQcReport({ summary: data.summary, findings: data.findings ?? [] });
      }
    } catch (err: any) {
      setQcError(err?.message || 'network_error');
    } finally {
      setQcRunning(false);
    }
  }

  const [showArchived, setShowArchived] = useState(false);
  // Rejected / deduped frames (is_selected === false) render faded and clutter
  // the gallery — tuck them behind an "Archived" toggle. Approved + undecided
  // stay in the main view. Approve/reset on an archived card un-archives it.
  const archivedPhotos = useMemo(() => photos.filter((p) => p.is_selected === false), [photos]);
  const activePhotos = useMemo(() => photos.filter((p) => p.is_selected !== false), [photos]);
  const shown = showArchived ? archivedPhotos : activePhotos;

  // If the last archived photo is restored while viewing Archived, drop back to
  // the gallery so the user isn't stranded on an empty view.
  useEffect(() => {
    if (showArchived && archivedPhotos.length === 0) setShowArchived(false);
  }, [showArchived, archivedPhotos.length]);

  const hasRooms = activePhotos.some((p) => (p as any).room_type);
  const roomGroups = useMemo(() => groupByRoom(shown as any[]), [shown]);

  async function organizeByRoom() {
    setOrganizing(true);
    setOrganizeError(null);
    try {
      const r = await fetch('/api/photos/classify-rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setOrganizeError(data.error || `error_${r.status}`);
      } else {
        setByRoom(true);
        onChange();
      }
    } catch (err: any) {
      setOrganizeError(err?.message || 'network_error');
    } finally {
      setOrganizing(false);
    }
  }

  async function findDuplicates() {
    setDeduping(true);
    setDedupeError(null);
    setDedupeResult(null);
    try {
      const r = await fetch('/api/photos/dedupe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setDedupeError(data.error || `error_${r.status}`);
      } else {
        setDedupeResult({ sets: data.duplicate_sets ?? 0, deselected: data.deselected ?? 0 });
        onChange();
      }
    } catch (err: any) {
      setDedupeError(err?.message || 'network_error');
    } finally {
      setDeduping(false);
    }
  }

  // Map each photo to its flat index so grouped cards still open the right
  // lightbox slide (the viewer iterates the flat stage3Photos array).
  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    photos.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [photos]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ocean-900">
            Review & Edit
            {processingJobs.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1.5 align-middle rounded-full bg-ocean-50 px-2.5 py-0.5 text-xs font-medium text-ocean-800 ring-1 ring-ocean-200">
                <Loader2 className="h-3 w-3 animate-spin" />
                {processingJobs.length} enhancing
              </span>
            )}
          </h2>
          <p className="text-sm text-slate-500">
            Approve your final picks. Hover any photo for extra edits like sky, window,
            twilight, virtual furniture, or object removal.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {(archivedPhotos.length > 0 || showArchived) && (
              <button
                onClick={() => setShowArchived((v) => !v)}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-md inline-flex items-center gap-1.5 transition ${
                  showArchived
                    ? 'bg-ocean-600 text-white hover:bg-ocean-500'
                    : 'ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
                title={showArchived ? 'Back to the gallery' : 'View archived (rejected / deduped) photos'}
              >
                {showArchived ? (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 rotate-180" /> Back to gallery
                  </>
                ) : (
                  <>
                    <Archive className="h-3.5 w-3.5" /> Archived ({archivedPhotos.length})
                  </>
                )}
              </button>
            )}
            {hasRooms && !showArchived && (
              <button
                onClick={() => setByRoom((v) => !v)}
                className="text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50"
              >
                {byRoom ? 'Flat grid' : 'Group by room'}
              </button>
            )}
            <button
              onClick={findDuplicates}
              disabled={deduping || photos.length < 2}
              className="text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-1.5"
              title="Detect near-identical frames and keep only the sharpest of each"
            >
              {deduping ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Find duplicates
                </>
              )}
            </button>
            <button
              onClick={runQcReview}
              disabled={qcRunning || photos.length === 0}
              className="text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-1.5"
              title="Check color accuracy, white-balance consistency across the set, and material/wall-color drift vs the originals"
            >
              {qcRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" /> Consistency check
                </>
              )}
            </button>
            <button
              onClick={organizeByRoom}
              disabled={organizing || photos.length === 0}
              className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-ocean-600 text-white hover:bg-ocean-500 disabled:opacity-60 inline-flex items-center gap-1.5"
              title="Use AI to tag each photo by area (living room, kitchen, primary bedroom, …)"
            >
              {organizing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Organizing…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" /> {hasRooms ? 'Re-scan rooms' : 'Organize by room'}
                </>
              )}
            </button>
          </div>
          <button onClick={onBack} className="text-xs text-slate-500 hover:text-slate-700">
            ← Back to AI Enhance
          </button>
        </div>
      </header>

      {organizeError && (
        <div className="card border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Couldn&apos;t organize by room: {organizeError}
        </div>
      )}

      {dedupeError && (
        <div className="card border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Duplicate scan failed: {dedupeError}
        </div>
      )}

      {dedupeResult && (
        <div className="card border-ocean-200 bg-ocean-50 p-3 text-sm text-ocean-900">
          {dedupeResult.sets === 0 ? (
            'No near-duplicate frames found — every photo looks unique.'
          ) : (
            <>
              Found {dedupeResult.sets} duplicate set{dedupeResult.sets === 1 ? '' : 's'} — kept
              the sharpest in each and deselected {dedupeResult.deselected} copy
              {dedupeResult.deselected === 1 ? '' : 'ies'} (dimmed below). Approve any to override.
            </>
          )}
        </div>
      )}

      {qcError && (
        <div className="card border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Consistency check failed: {qcError}
        </div>
      )}

      {qcReport && (
        <QcReportPanel
          report={qcReport}
          orderId={orderId}
          onChange={onChange}
          onClose={() => setQcReport(null)}
        />
      )}

      {failedJobs.length > 0 && (
        <div className="card border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <div className="font-medium mb-1">
            {failedJobs.length} job{failedJobs.length === 1 ? '' : 's'} failed — re-run from AI Enhance
          </div>
          <ul className="space-y-0.5 text-xs text-rose-700">
            {failedJobs.slice(0, 4).map((j) => (
              <li key={j.id} className="truncate">
                {JOB_LABEL[j.job_type] ?? j.job_type}: {j.error_message ?? 'unknown error'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showArchived && (
        <div className="card border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Archived photos (rejected or de-duplicated) are hidden from the gallery and excluded from
          delivery. Approve or un-reject any to restore it.
        </div>
      )}

      {/* Calm background progress. Enhancement runs server-side, so instead of
          a screen full of churning skeleton tiles we show one quiet line and let
          finished photos fill in. */}
      {!showArchived && processingJobs.length > 0 && (
        <div className="card flex items-center gap-3 p-3.5 text-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ocean-600" />
          <div className="min-w-0">
            <div className="font-medium text-slate-800">
              Enhancing {processingJobs.length} photo{processingJobs.length === 1 ? '' : 's'} in the background…
            </div>
            <div className="text-xs text-slate-500">
              {shown.length} ready so far — finished photos appear below. You can leave this page; it keeps going.
            </div>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        // While work is in flight the progress line above is enough — don't also
        // show an empty state. Only show it when there's genuinely nothing.
        processingJobs.length > 0 && !showArchived ? null : (
          <div className="card">
            {showArchived ? (
              <EmptyState
                compact
                icon={Archive}
                title="Nothing archived"
                description="Rejected or de-duplicated photos will collect here, out of the way."
              />
            ) : (
              <EmptyState
                compact
                icon={Sparkles}
                title="Nothing to review yet"
                description="Enhanced photos will show up here as they finish."
              />
            )}
          </div>
        )
      ) : byRoom && hasRooms && !showArchived ? (
        <div className="space-y-8">
          {roomGroups.map((g) => (
            <section key={g.label}>
              <h3 className="mb-2 flex items-baseline gap-2 border-b border-slate-100 pb-1.5">
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ocean-700">
                  {g.label}
                </span>
                <span className="text-xs text-slate-400">{g.photos.length}</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {(g.photos as Photo[]).map((p) => (
                  <ProcessedCard
                    key={p.id}
                    photo={p}
                    onOpen={() => openViewer(indexById.get(p.id) ?? 0)}
                    urls={photoUrls}
                    setUrls={setPhotoUrls}
                    onChange={onChange}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {shown.map((p) => (
            <ProcessedCard
              key={p.id}
              photo={p}
              onOpen={() => openViewer(indexById.get(p.id) ?? 0)}
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

// ─── In-flight job placeholder (Stage 3) ────────────────────────────────────
function ProcessingTile({ job }: { job: JobView }) {
  return (
    <div className="relative aspect-[3/2] overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200">
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100" />
      <div className="relative h-full w-full flex flex-col items-center justify-center gap-1.5 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-ocean-600" />
        <span className="text-xs font-medium">{JOB_LABEL[job.job_type] ?? 'Processing'}…</span>
        <span className="text-[10px] text-slate-400">
          {PROVIDER_SHORT[job.provider] ?? job.provider}
        </span>
      </div>
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
  const { ref, inView } = useInView<HTMLDivElement>();
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const ext = (photo.filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toUpperCase();
  const sizeMB = photo.byte_size ? (photo.byte_size / 1024 / 1024).toFixed(1) : null;

  useEffect(() => {
    if (raw) return;
    if (!inView) return;
    if (url !== undefined) return;
    fetch(`/api/photo-url?photo_id=${photo.id}&w=640`)
      .then((r) => r.json())
      .then((d) => setUrls((u) => ({ ...u, [photo.id]: d.url ?? null })))
      .catch(() => setUrls((u) => ({ ...u, [photo.id]: null })));
  }, [photo.id, url, setUrls, raw, inView]);

  async function convert() {
    setConverting(true);
    setConvertError(null);
    try {
      const r = await fetch('/api/raw-convert', {
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
      ref={ref}
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
        <img src={url} alt={photo.filename} loading="lazy" decoding="async" className="h-full w-full object-cover" />
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

// ─── Consistency check results ──────────────────────────────────────────────
const QC_FLAG_LABEL: Record<string, string> = {
  warm: 'runs warm',
  cool: 'runs cool',
  green: 'green tint',
  magenta: 'magenta tint',
  bright: 'brighter than set',
  dark: 'darker than set',
};

function QcReportPanel({
  report,
  orderId,
  onChange,
  onClose,
}: {
  report: { summary: any; findings: any[] };
  orderId: string;
  onChange: () => void;
  onClose: () => void;
}) {
  const s = report.summary ?? {};
  const findings = report.findings ?? [];
  const clean = findings.length === 0;
  const score = typeof s.consistency_score === 'number' ? s.consistency_score : null;
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixed, setFixed] = useState<number | null>(null);

  async function fixAll() {
    setFixing(true);
    setFixError(null);
    try {
      const r = await fetch('/api/ai/qc-fix', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFixError(data.message || data.error || `error_${r.status}`);
      } else {
        setFixed(data.queued?.length ?? 0);
        onChange();
      }
    } catch (err: any) {
      setFixError(err?.message || 'network_error');
    } finally {
      setFixing(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-ocean-600" />
          <h3 className="text-sm font-semibold text-slate-900">Consistency check</h3>
          {s.profile && (
            <span className="pill bg-slate-100 text-slate-600" title="Production profile — sets the QC bar">
              {s.profile}
            </span>
          )}
          {typeof s.pass === 'boolean' && (
            <span className={`pill ${s.pass ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {s.pass ? 'Meets profile bar' : 'Below profile bar'}
            </span>
          )}
          {score !== null && (
            <span
              className={`pill ${
                typeof s.min_score === 'number'
                  ? score >= s.min_score
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                  : score >= 85
                  ? 'bg-emerald-100 text-emerald-700'
                  : score >= 70
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-700'
              }`}
              title={typeof s.min_score === 'number' ? `Profile bar: ${s.min_score}/100` : undefined}
            >
              {score}/100 consistent{typeof s.min_score === 'number' ? ` · need ${s.min_score}` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!clean && fixed === null && (
            <button
              onClick={fixAll}
              disabled={fixing}
              className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-ocean-600 text-white hover:bg-ocean-500 disabled:opacity-60 inline-flex items-center gap-1.5"
              title="Re-render every flagged photo from its original with a targeted correction"
            >
              {fixing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fixing…
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" /> Fix all flagged ({findings.length})
                </>
              )}
            </button>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" title="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {fixError && <p className="text-sm text-rose-600">Fix failed: {fixError}</p>}
      {fixed !== null && (
        <div className="flex items-center gap-2 text-sm text-ocean-800">
          <Loader2 className="h-4 w-4 animate-spin" /> Re-rendering {fixed} photo
          {fixed === 1 ? '' : 's'} with corrections — they&apos;ll refresh in the grid as each
          finishes. The originals stay until you approve the new versions.
        </div>
      )}

      <p className="text-sm text-slate-600">
        Reviewed {s.photo_count ?? 0} photo{(s.photo_count ?? 0) === 1 ? '' : 's'}
        {s.ai_ran
          ? ' including an AI wall / color-accuracy check against the originals'
          : ' for color consistency (set OPENAI_API_KEY to add the AI wall/accuracy check)'}
        {s.truncated ? ` · limited to the first ${s.photo_count}` : ''}.
      </p>

      {/* Set-level verdict reasons (profile bar): these can fire even when no
          single photo is flagged — e.g. the whole set runs warm for an
          architectural profile, or the score is under the bar. */}
      {Array.isArray(s.verdict_reasons) && s.verdict_reasons.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {s.verdict_reasons.map((r: string, i: number) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
      {s.fidelity_unverified && (
        <p className="text-xs text-amber-700">
          This profile expects an AI material-fidelity check — set OPENAI_API_KEY to verify wall /
          material colors weren&apos;t altered.
        </p>
      )}

      {clean && s.pass !== false ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Looks clean — consistent white balance and no
          material-color drift detected.
        </div>
      ) : (
        <ul className="-my-1 divide-y divide-slate-100">
          {findings.map((f: any) => {
            const issues: string[] = [];
            if (f.consistency?.flags?.length)
              issues.push(f.consistency.flags.map((k: string) => QC_FLAG_LABEL[k] ?? k).join(', '));
            if (f.ai?.wall_drift) issues.push('material/wall color changed');
            if (f.ai && f.ai.white_balance_ok === false) issues.push('off white balance');
            if (f.ai && f.ai.color_accuracy === 'poor') issues.push('poor color accuracy');
            if (f.blown_highlights)
              issues.push(`blown highlights (${Math.round((f.blown_highlights.fraction ?? 0) * 100)}%)`);
            return (
              <li key={f.photo_id} className="flex items-start gap-2 py-2 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <div className="font-medium text-slate-800">
                    {f.filename}
                    {f.room_type && <span className="font-normal text-slate-400"> · {f.room_type}</span>}
                  </div>
                  <div className="text-slate-600">
                    {issues.join(' · ')}
                    {f.ai?.notes ? ` — ${f.ai.notes}` : ''}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!clean && (
        <p className="text-xs text-slate-500">
          Open a flagged photo and use <span className="font-medium">Redo</span> (or the edit chips)
          to re-render it into line with the set.
        </p>
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
  const { ref, inView } = useInView<HTMLDivElement>();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!inView) return;
    if (url !== undefined) return;
    fetch(`/api/photo-url?photo_id=${photo.id}&w=640`)
      .then((r) => r.json())
      .then((d) => setUrls((u) => ({ ...u, [photo.id]: d.url ?? null })))
      .catch(() => setUrls((u) => ({ ...u, [photo.id]: null })));
  }, [photo.id, url, setUrls, inView]);

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

  // Faithfully re-run the recipe that produced this photo, from the ORIGINAL
  // frame(s) — not a fresh default pass on the already-processed output. Makes
  // an edit reproducible with one click; the old output is kept for comparison.
  async function rerunRecipe() {
    setBusy('rerun');
    try {
      const r = await fetch('/api/ai/rerun', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photo_id: photo.id }),
      });
      if (!r.ok) {
        // No stored recipe (e.g. a pre-recipe output) — fall back to a fresh
        // enhance so the button still does something useful.
        const j = await r.json().catch(() => ({}));
        if (j?.error === 'no_recipe' || j?.error === 'no_inputs') {
          await applyExtra('enhance_single');
          return;
        }
      }
      onChange();
    } finally {
      setBusy(null);
    }
  }

  const recipeSummary = describeRecipe((photo as any).ai_recipe ?? null);

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
      ref={ref}
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
        <img src={url} alt={photo.filename} loading="lazy" decoding="async" className="h-full w-full object-cover" />
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

      {/* Bottom action area: approve/reject + chips. pointer-events-none while
          hidden so clicks fall through to the card (open viewer); re-enabled on
          hover so the buttons work. We do NOT stop propagation on the container —
          only the buttons do — so clicking the empty gradient still opens the
          loupe instead of being swallowed. */}
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-2 opacity-0 transition pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); decide(isApproved ? 'reset' : 'approve'); }}
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
              onClick={(e) => { e.stopPropagation(); decide(isRejected ? 'reset' : 'reject'); }}
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
            onClick={(e) => { e.stopPropagation(); rerunRecipe(); }}
            disabled={busy !== null}
            title={
              recipeSummary
                ? `Re-run this recipe from the original frame · ${recipeSummary}`
                : 'Re-run enhance from the original frame'
            }
            className="p-1.5 rounded-md bg-white/15 text-white text-xs hover:bg-ocean-600 transition"
          >
            {busy === 'rerun' || busy === 'enhance_single' ? (
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
                onClick={(ev) => { ev.stopPropagation(); applyExtra(e.id); }}
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
