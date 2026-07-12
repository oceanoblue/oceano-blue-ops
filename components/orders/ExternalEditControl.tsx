'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import {
  Loader2,
  Download,
  Send,
  ExternalLink,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  PackageCheck,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type ManifestEntryView = {
  photo_id: string;
  export_name: string;
  imported_at?: string;
};

export type ExternalEditBatchView = {
  id: string;
  status: string; // export_ready | sent | returned | closed
  external_url: string | null;
  photo_count: number;
  imported_count: number;
  sent_at: string | null;
  returned_at: string | null;
  manifest: ManifestEntryView[];
};

type TrayFile = {
  name: string;
  storage_path: string;
  byte_size: number;
  mime_type?: string;
  width?: number;
  height?: number;
  reason: 'no_match' | 'ambiguous';
  assigned?: string; // manifest photo_id chosen in the tray
};

const STATUS_COPY: Record<string, { label: string; cls: string }> = {
  export_ready: { label: 'Export ready — download and upload to Fotello', cls: 'bg-amber-100 text-amber-800' },
  sent: { label: 'Sent to Fotello — waiting for edits', cls: 'bg-ocean-100 text-ocean-800' },
  returned: { label: 'Edits returned — review in Photos below', cls: 'bg-emerald-100 text-emerald-800' },
  closed: { label: 'Batch closed', cls: 'bg-slate-100 text-slate-600' },
};

/** Team control: round-trip an order's photos through Fotello (interim edit
 *  provider). Export a sequence-named zip, track the handoff, and import the
 *  returned edits — matched to originals by filename, with a manual tray for
 *  anything the matcher won't guess. */
export function ExternalEditControl({
  orderId,
  batch,
  exportablePhotoCount,
}: {
  orderId: string;
  batch: ExternalEditBatchView | null;
  exportablePhotoCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState(batch?.external_url ?? '');
  const [tray, setTray] = useState<TrayFile[]>([]);
  const [importedNow, setImportedNow] = useState(0);

  const active = batch && batch.status !== 'closed';
  const openEntries = useMemo(
    () => (batch?.manifest ?? []).filter((e) => !e.imported_at),
    [batch]
  );

  async function api(path: string, init: RequestInit) {
    const r = await fetch(path, {
      headers: { 'content-type': 'application/json' },
      ...init,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const createBatch = () =>
    run('create', async () => {
      await api('/api/external-edit', {
        method: 'POST',
        body: JSON.stringify({ order_id: orderId }),
      });
    });

  const markSent = () =>
    run('sent', async () => {
      await api(`/api/external-edit/${batch!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'mark_sent', ...(url ? { external_url: url } : {}) }),
      });
    });

  const saveUrl = () =>
    run('url', async () => {
      await api(`/api/external-edit/${batch!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set_url', external_url: url }),
      });
    });

  const closeBatch = () =>
    run('close', async () => {
      await api(`/api/external-edit/${batch!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'close' }),
      });
    });

  /** Upload dropped files direct to storage (Vercel body limit), then register. */
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (!batch || accepted.length === 0) return;
      void run('import', async () => {
        const supabase = createClient();
        const payload: Omit<TrayFile, 'reason'>[] = [];
        for (const file of accepted) {
          const safeName = file.name.replace(/[^\w.\-]+/g, '_');
          const storagePath = `${orderId}/fotello-${batch.id.slice(0, 8)}/${crypto.randomUUID()}-${safeName}`;
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
            /* dimensions are optional */
          }
          payload.push({
            name: file.name,
            storage_path: storagePath,
            byte_size: file.size,
            mime_type: file.type || 'image/jpeg',
            width,
            height,
          });
        }

        const d = await api(`/api/external-edit/${batch.id}/import`, {
          method: 'POST',
          body: JSON.stringify({ files: payload }),
        });
        setImportedNow((n) => n + (d.imported?.length ?? 0));
        const unmatchedNames = new Set((d.unmatched ?? []).map((u: any) => u.name));
        setTray((prev) => [
          ...prev,
          ...payload
            .filter((p) => unmatchedNames.has(p.name))
            .map((p) => ({
              ...p,
              reason: (d.unmatched as any[]).find((u) => u.name === p.name)?.reason ?? 'no_match',
            })),
        ]);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batch, orderId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    disabled: !active || batch?.status === 'export_ready' || busy !== null,
  });

  const importAssigned = () =>
    run('tray', async () => {
      const assigned = tray.filter((t) => t.assigned);
      if (assigned.length === 0) return;
      const mapping = Object.fromEntries(assigned.map((t) => [t.name, t.assigned!]));
      const d = await api(`/api/external-edit/${batch!.id}/import`, {
        method: 'POST',
        body: JSON.stringify({
          files: assigned.map(({ reason, assigned: _a, ...f }) => f),
          mapping,
        }),
      });
      setImportedNow((n) => n + (d.imported?.length ?? 0));
      setTray((prev) => prev.filter((t) => !t.assigned));
    });

  // ── No batch yet ─────────────────────────────────────────────
  if (!batch || batch.status === 'closed') {
    return (
      <div className="space-y-3">
        {batch?.status === 'closed' && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            <PackageCheck className="h-4 w-4" />
            Last batch closed — {batch.imported_count} edit{batch.imported_count === 1 ? '' : 's'} imported.
          </div>
        )}
        <button
          onClick={createBatch}
          disabled={busy !== null || exportablePhotoCount === 0}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          title={exportablePhotoCount === 0 ? 'Upload photos first' : ''}
        >
          {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Create Fotello batch ({exportablePhotoCount} photo{exportablePhotoCount === 1 ? '' : 's'})
        </button>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  // ── Active batch ─────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${STATUS_COPY[batch.status]?.cls ?? 'bg-slate-100'}`}>
        {batch.status === 'sent' && <Loader2 className="h-4 w-4 animate-spin" />}
        {batch.status === 'returned' && <CheckCircle2 className="h-4 w-4" />}
        <span>{STATUS_COPY[batch.status]?.label ?? batch.status}</span>
      </div>

      <p className="text-xs text-slate-500">
        {batch.photo_count} photo{batch.photo_count === 1 ? '' : 's'} exported
        {batch.imported_count > 0 && <> · {batch.imported_count} matched + imported</>}
        {batch.sent_at && <> · sent {new Date(batch.sent_at).toLocaleDateString()}</>}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/external-edit/${batch.id}/export`}
          className="btn-secondary inline-flex items-center gap-1.5"
        >
          <Download className="h-4 w-4" /> Export zip
        </a>
        {batch.status === 'export_ready' && (
          <button
            onClick={markSent}
            disabled={busy !== null}
            className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === 'sent' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Mark as sent
          </button>
        )}
        {batch.status === 'returned' && (
          <button
            onClick={closeBatch}
            disabled={busy !== null}
            className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <PackageCheck className="h-4 w-4" /> Close batch
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Fotello listing URL"
          className="input flex-1"
        />
        <button onClick={saveUrl} disabled={busy !== null || !url} className="btn-ghost disabled:opacity-50">
          Save
        </button>
        {batch.external_url && (
          <a
            href={batch.external_url}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost inline-flex items-center gap-1"
          >
            <ExternalLink className="h-4 w-4" /> Open
          </a>
        )}
      </div>

      {batch.status !== 'export_ready' && (
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors ${
            isDragActive ? 'border-ocean-400 bg-ocean-50' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <input {...getInputProps()} />
          <UploadCloud className="mx-auto mb-2 h-5 w-5 text-slate-400" />
          {busy === 'import' ? (
            <span className="inline-flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Uploading + matching…
            </span>
          ) : (
            <span className="text-slate-600">
              Drop Fotello&rsquo;s edited files here — they&rsquo;re matched to the originals by filename.
            </span>
          )}
        </div>
      )}

      {importedNow > 0 && (
        <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> {importedNow} file{importedNow === 1 ? '' : 's'} imported this session — review them in Photos below.
        </p>
      )}

      {tray.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-900">
            <AlertCircle className="h-4 w-4" /> {tray.length} file{tray.length === 1 ? '' : 's'} need manual matching
          </p>
          {tray.map((t) => (
            <div key={t.name} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-slate-700" title={t.name}>
                {t.name}
              </span>
              <select
                value={t.assigned ?? ''}
                onChange={(e) =>
                  setTray((prev) =>
                    prev.map((x) => (x.name === t.name ? { ...x, assigned: e.target.value || undefined } : x))
                  )
                }
                className="input max-w-[240px]"
              >
                <option value="">Match to…</option>
                {openEntries.map((e) => (
                  <option key={e.photo_id} value={e.photo_id}>
                    {e.export_name}
                  </option>
                ))}
                {(batch.manifest ?? [])
                  .filter((e) => e.imported_at)
                  .map((e) => (
                    <option key={e.photo_id} value={e.photo_id}>
                      {e.export_name} (already imported)
                    </option>
                  ))}
              </select>
            </div>
          ))}
          <button
            onClick={importAssigned}
            disabled={busy !== null || tray.every((t) => !t.assigned)}
            className="btn-primary disabled:opacity-50"
          >
            {busy === 'tray' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Import assigned'}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
