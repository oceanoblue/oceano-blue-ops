'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { Loader2, Download, UploadCloud, CheckCircle2 } from 'lucide-react';
import { extractUploadExif } from '@/lib/photos/exif-extract';
import { createClient } from '@/lib/supabase/client';

/** Provider-neutral external-editing workflow, kept deliberately simple:
 *  1. Download the shoot's originals as one zip.
 *  2. Edit them in whatever editor you use (any provider).
 *  3. Drop the finished files here — they register as processed photos and
 *     flow straight into Review & Edit and client delivery. */
export function EditingWorkspace({
  orderId,
  originalsCount,
  finalsCount,
}: {
  orderId: string;
  originalsCount: number;
  finalsCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (accepted.length === 0) return;
      setBusy(true);
      setError(null);
      setProgress({ done: 0, total: accepted.length });
      try {
        const supabase = createClient();
        const files: any[] = [];
        for (const file of accepted) {
          const photoId = crypto.randomUUID();
          const safeName = file.name.replace(/[^\w.\-]+/g, '_');
          const storagePath = `${orderId}/${photoId}-${safeName}`;
          const { error: upErr } = await supabase.storage
            .from('processed-photos')
            .upload(storagePath, file, {
              contentType: file.type || 'image/jpeg',
              upsert: false,
              cacheControl: '3600',
            });
          if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);

          let width: number | undefined;
          let height: number | undefined;
          try {
            const bmp = await createImageBitmap(file);
            width = bmp.width;
            height = bmp.height;
            bmp.close();
          } catch {
            /* optional */
          }
          files.push({
            photo_id: photoId,
            filename: file.name,
            storage_path: storagePath,
            mime_type: file.type || 'image/jpeg',
            byte_size: file.size,
            width,
            height,
            exif: await extractUploadExif(file),
          });
          setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        }

        const r = await fetch('/api/photos/register-finals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ order_id: orderId, files }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Register failed (${r.status})`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    disabled: busy,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {originalsCount > 0 ? <a href={`/api/photos/export-originals?order_id=${orderId}`} className="btn-secondary min-h-11"><Download className="h-4 w-4"/>Download originals ({originalsCount})</a>
          : <p className="text-sm text-slate-500">Originals collected through Dropbox are available in the property’s Dropbox folder.</p>}
      </div>

      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed px-5 py-12 text-center text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500 ${
          isDragActive ? 'border-ocean-500 bg-ocean-100' : 'border-ocean-200 bg-ocean-50/40 hover:border-ocean-400 hover:bg-ocean-50'
        }`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="mx-auto mb-4 h-9 w-9 text-ocean-600" />
        {busy ? (
          <span className="inline-flex items-center gap-2 text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading finals {progress ? `${progress.done}/${progress.total}` : ''}…
          </span>
        ) : (
          <span className="text-slate-600">
            <strong className="block text-base text-ink-950">Drop finished photos here</strong><span className="mt-2 block text-sm text-slate-500">or click to choose files · JPEG, PNG, TIFF, WebP</span>
          </span>
        )}
      </div>

      {finalsCount > 0 && (
        <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {finalsCount} final{finalsCount === 1 ? '' : 's'} on this
          order — open Review to choose the client’s final selection.
        </p>
      )}

      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
