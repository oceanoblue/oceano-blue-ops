'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen, Loader2, UploadCloud, CloudDownload } from 'lucide-react';
import { generateThumbnail, blobToBase64 } from '@/lib/photos/client-thumbnail';

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
  const [dbxBusy, setDbxBusy] = useState(false);
  const [dbxMsg, setDbxMsg] = useState<string | null>(null);

  // Pull the photographer's uploads straight from the order's Dropbox intake
  // folder — no local machine, no desktop sync. Registers assets + groups.
  async function importFromDropbox() {
    setDbxBusy(true);
    setDbxMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/re-photo/import-dropbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'import_failed');
      setDbxMsg(
        json.imported > 0
          ? `Imported ${json.imported} file${json.imported === 1 ? '' : 's'} — ${json.groups} bracket group${json.groups === 1 ? '' : 's'}${json.needs_review ? `, ${json.needs_review} need review` : ''}.`
          : (json.message ?? 'Nothing new to import.')
      );
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Dropbox import failed');
    } finally {
      setDbxBusy(false);
    }
  }

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
      const fileByPath = new Map<string, File>();

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress(`Reading EXIF ${i + 1}/${files.length}…`);
        const localPath = (f as any).webkitRelativePath || f.name;
        fileByPath.set(localPath, f);
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
          local_path: localPath,
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
      const created: Array<{ id: string; local_path: string }> = [];
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
        for (const a of json.assets ?? []) created.push(a);
      }

      // Generate thumbnails locally and upload only the small previews.
      // Upload failures don't abort the ingest (originals are already indexed),
      // but they must not vanish silently either — count and report them.
      let thumbBatch: Array<{ asset_id: string; content_base64: string; mime: string }> = [];
      let thumbFailures = 0;
      const flush = async () => {
        if (thumbBatch.length === 0) return;
        const batchSize = thumbBatch.length;
        try {
          const res = await fetch('/api/re-photo/thumbnails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: jobId, items: thumbBatch }),
          });
          if (!res.ok) thumbFailures += batchSize;
        } catch {
          thumbFailures += batchSize;
        }
        thumbBatch = [];
      };
      for (let i = 0; i < created.length; i++) {
        const a = created[i];
        const file = fileByPath.get(a.local_path);
        if (!file) continue;
        setProgress(`Building thumbnails ${i + 1}/${created.length}…`);
        const thumb = await generateThumbnail(file);
        if (!thumb) continue;
        thumbBatch.push({ asset_id: a.id, content_base64: await blobToBase64(thumb.blob), mime: thumb.mime });
        if (thumbBatch.length >= 10) await flush();
      }
      await flush();

      setProgress(`Done — ${payloads.length} files, ${totalGroups} groups, ${totalReview} need review.`);
      if (thumbFailures > 0) {
        setError(
          `${thumbFailures} thumbnail${thumbFailures === 1 ? '' : 's'} failed to upload — originals are indexed; use "Generate thumbnails" to retry previews.`
        );
      }
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
        Import the photographer&apos;s uploads from the order&apos;s Dropbox intake folder, or select a
        local shoot folder. Either way only metadata is registered and brackets are grouped.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={dbxBusy || busy}
          onClick={importFromDropbox}
        >
          {dbxBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
          Import from Dropbox
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy || dbxBusy}
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

      {dbxMsg && <p className="mt-3 text-sm text-emerald-700">{dbxMsg}</p>}
      {progress && <p className="mt-3 text-sm text-slate-600">{progress}</p>}
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
