'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen, Loader2, UploadCloud } from 'lucide-react';

const IMAGE_EXT = /\.(jpe?g|png|tiff?|heic|webp|arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;
const EXIF_PICK = [
  'DateTimeOriginal',
  'ExposureBiasValue',
  'Make',
  'Model',
  'LensModel',
  'FocalLength',
  'FNumber',
  'ISO',
  'ExposureTime',
] as const;

type FilePayload = {
  filename: string;
  local_path: string;
  byte_size: number;
  mime_type: string;
  captured_at: string | null;
  exif: Record<string, unknown>;
};

/**
 * Reads a folder (or a multi-file selection) in the browser, extracts EXIF
 * client-side with `exifr`, and posts ONLY metadata to the ingest API. Heavy
 * media never leaves the local machine — matching the Production OS storage
 * model. The server registers assets + detects brackets, then we refresh.
 */
export function IngestPanel({ jobId }: { jobId: string }) {
  const router = useRouter();
  const folderRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Enable directory selection without fighting TypeScript's input typings.
  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute('webkitdirectory', '');
      folderRef.current.setAttribute('directory', '');
    }
  }, []);

  async function handleFiles(fileList: FileList | null) {
    setError(null);
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) => IMAGE_EXT.test(f.name));
    if (files.length === 0) {
      setError('No supported image files found in that selection.');
      return;
    }

    setBusy(true);
    try {
      const exifr = (await import('exifr')).default;
      const payloads: FilePayload[] = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress(`Reading EXIF ${i + 1}/${files.length}…`);
        let tags: Record<string, unknown> = {};
        let capturedAt: string | null = null;
        try {
          const parsed = await exifr.parse(f, { pick: EXIF_PICK as unknown as string[] });
          if (parsed) {
            tags = parsed;
            const dto = parsed.DateTimeOriginal;
            if (dto instanceof Date) capturedAt = dto.toISOString();
          }
        } catch {
          // RAW or unreadable header — filename detection still works.
        }
        payloads.push({
          filename: f.name,
          local_path: (f as any).webkitRelativePath || f.name,
          byte_size: f.size,
          mime_type: f.type || 'application/octet-stream',
          captured_at: capturedAt,
          exif: tags,
        });
      }

      // Post in chunks so large folders don't hit body limits.
      const CHUNK = 150;
      let totalGroups = 0;
      let totalReview = 0;
      for (let i = 0; i < payloads.length; i += CHUNK) {
        const slice = payloads.slice(i, i + CHUNK);
        setProgress(`Ingesting ${Math.min(i + CHUNK, payloads.length)}/${payloads.length}…`);
        const res = await fetch('/api/re-photo/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, files: slice }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'ingest_failed');
        totalGroups += json.groups ?? 0;
        totalReview += json.needs_review ?? 0;
      }
      setProgress(`Done — ${payloads.length} files, ${totalGroups} groups, ${totalReview} need review.`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Ingest failed');
    } finally {
      setBusy(false);
      if (folderRef.current) folderRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="card p-5">
      <h2 className="mb-1 font-semibold text-slate-900">Ingest photos</h2>
      <p className="mb-4 text-sm text-slate-600">
        Select a shoot folder (or files). EXIF is read locally and only metadata
        is registered — your originals stay on this machine.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => folderRef.current?.click()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
          Select folder
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <UploadCloud className="h-4 w-4" />
          Select files
        </button>
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.arw,.cr2,.cr3,.nef,.dng,.raf,.rw2,.orf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {progress && <p className="mt-3 text-sm text-slate-600">{progress}</p>}
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
