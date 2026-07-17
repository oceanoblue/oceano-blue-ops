'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Plus, Video, Box, Map, FileText, Link2, Upload, Trash2, Eye, EyeOff, ExternalLink,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export type DeliverableKind = 'video' | 'tour_360' | 'floor_plan' | 'other';

export type DeliverableRow = {
  id: string;
  kind: DeliverableKind;
  title: string | null;
  source: 'url' | 'file';
  external_url: string | null;
  filename: string | null;
  is_published: boolean;
};

const KIND_META: Record<DeliverableKind, { label: string; icon: any; accept: string; urlHint: string }> = {
  video: { label: 'Video', icon: Video, accept: 'video/mp4,video/quicktime,video/webm', urlHint: 'YouTube / Vimeo URL' },
  tour_360: { label: '360° Tour', icon: Box, accept: '', urlHint: 'Matterport / Kuula URL' },
  floor_plan: { label: 'Floor plan', icon: Map, accept: 'application/pdf,image/*', urlHint: 'Link to floor plan' },
  other: { label: 'Other', icon: FileText, accept: 'application/pdf,image/*,video/*', urlHint: 'Link' },
};

export function DeliverablesManager({
  orderId,
  listingId,
  initial,
}: {
  orderId: string;
  listingId: string;
  initial: DeliverableRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<DeliverableKind>('video');
  const [mode, setMode] = useState<'url' | 'file'>('url');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = KIND_META[kind];

  async function addUrl() {
    if (!url.trim()) {
      setError('Paste the link first.');
      return;
    }
    setBusy('add');
    setError(null);
    try {
      const r = await fetch(`/api/orders/${orderId}/deliverables`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, source: 'url', external_url: url.trim(), title: title || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
      reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function addFile(file: File) {
    setBusy('add');
    setError(null);
    try {
      const supabase = createClient();
      const safe = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${listingId}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from('deliverables')
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      const r = await fetch(`/api/orders/${orderId}/deliverables`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          source: 'file',
          storage_path: path,
          filename: file.name,
          mime_type: file.type || undefined,
          byte_size: file.size,
          title: title || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
      reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function togglePublish(row: DeliverableRow) {
    setBusy(`pub-${row.id}`);
    setError(null);
    try {
      const r = await fetch(`/api/deliverables/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_published: !row.is_published }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: DeliverableRow) {
    if (!confirm('Remove this deliverable? The client will no longer see it.')) return;
    setBusy(`del-${row.id}`);
    setError(null);
    try {
      const r = await fetch(`/api/deliverables/${row.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setAdding(false);
    setTitle('');
    setUrl('');
  }

  return (
    <div className="space-y-3">
      {initial.length > 0 && (
        <ul className="space-y-2">
          {initial.map((row) => {
            const Icon = KIND_META[row.kind].icon;
            return (
              <li key={row.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
                <Icon className="h-4 w-4 shrink-0 text-ocean-600" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-900">
                    {row.title || KIND_META[row.kind].label}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {row.source === 'url' ? row.external_url : row.filename}
                  </div>
                </div>
                {row.source === 'url' && row.external_url && (
                  <a href={row.external_url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-600">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <button
                  onClick={() => togglePublish(row)}
                  disabled={busy === `pub-${row.id}`}
                  title={row.is_published ? 'Visible to client — click to hide' : 'Hidden — click to publish'}
                  className={row.is_published ? 'text-emerald-600' : 'text-slate-300'}
                >
                  {busy === `pub-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : row.is_published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button onClick={() => remove(row)} disabled={busy === `del-${row.id}`} className="text-slate-300 hover:text-rose-600">
                  {busy === `del-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(KIND_META) as DeliverableKind[]).map((k) => {
              const Icon = KIND_META[k].icon;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
                    kind === k ? 'bg-ocean-600 text-white ring-ocean-600' : 'bg-white text-slate-600 ring-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {KIND_META[k].label}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => setMode('url')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${mode === 'url' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
              <Link2 className="h-3.5 w-3.5" /> Link
            </button>
            <button type="button" onClick={() => setMode('file')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${mode === 'file' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
          </div>

          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="input" />

          {mode === 'url' ? (
            <div className="flex gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={meta.urlHint} className="input flex-1" />
              <button onClick={addUrl} disabled={busy === 'add'} className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50">
                {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 p-4 text-sm text-slate-600 hover:border-slate-300">
              {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy === 'add' ? 'Uploading…' : `Choose ${meta.label.toLowerCase()} file`}
              <input
                type="file"
                accept={meta.accept}
                className="hidden"
                disabled={busy === 'add'}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) addFile(f);
                }}
              />
            </label>
          )}

          <button type="button" onClick={reset} className="btn-ghost text-sm">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="btn-secondary inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Add video, tour, or floor plan
        </button>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
