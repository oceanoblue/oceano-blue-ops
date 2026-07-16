'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import {
  Loader2,
  Download,
  ExternalLink,
  UploadCloud,
  CheckCircle2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const FOTELLO_APP_URL = 'https://app.fotello.co';

/** Interim Fotello workflow, kept deliberately simple:
 *  1. Download the shoot's originals as one zip.
 *  2. Open Fotello in its own app-sized window and edit there.
 *     (Fotello can't be embedded: its app sits behind bot protection and a
 *     login that third-party-cookie rules break inside an iframe.)
 *  3. Drop the finished files here — they register as processed photos and
 *     flow straight into Review & Edit and client delivery. */
export function FotelloWorkspace({
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
  const [importedNow, setImportedNow] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function openFotello() {
    window.open(FOTELLO_APP_URL, 'fotello-workspace', 'width=1440,height=920,noopener');
  }

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
        setImportedNow((n) => n + (d.registered ?? 0));
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
        <button onClick={openFotello} className="btn-primary inline-flex items-center gap-1.5">
          <ExternalLink className="h-4 w-4" /> Open Fotello
        </button>
        <a
          href={`/api/photos/export-originals?order_id=${orderId}`}
          className={`btn-secondary inline-flex items-center gap-1.5 ${originalsCount === 0 ? 'pointer-events-none opacity-50' : ''}`}
          title={originalsCount === 0 ? 'No originals uploaded yet' : ''}
        >
          <Download className="h-4 w-4" /> Download originals ({originalsCount})
        </a>
      </div>

      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors ${
          isDragActive ? 'border-ocean-400 bg-ocean-50' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="mx-auto mb-2 h-5 w-5 text-slate-400" />
        {busy ? (
          <span className="inline-flex items-center gap-2 text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading finals {progress ? `${progress.done}/${progress.total}` : ''}…
          </span>
        ) : (
          <span className="text-slate-600">
            Drop the <strong>finished photos</strong> from Fotello here — they go straight to
            Review &amp; delivery.
          </span>
        )}
      </div>

      {(finalsCount > 0 || importedNow > 0) && (
        <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {finalsCount + importedNow > 0 && (
            <>
              {finalsCount + importedNow} final{finalsCount + importedNow === 1 ? '' : 's'} on this
              order — review below, then create the delivery link.
            </>
          )}
        </p>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
