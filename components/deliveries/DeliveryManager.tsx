'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, ExternalLink, Save } from 'lucide-react';
import { DELIVERY_TYPES, DELIVERY_STATUSES, STATUS_STYLE } from '@/lib/deliveries/constants';

export type Delivery = {
  id: string;
  delivery_type: string;
  status: string;
  version_number: number;
  title: string | null;
  external_url: string | null;
  created_at: string;
};

export function DeliveryManager({ jobId, deliveries }: { jobId: string; deliveries: Delivery[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState(DELIVERY_TYPES[0]);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/deliveries/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, delivery_type: type, title: title || undefined, external_url: url || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) alert(`Failed: ${json.error ?? res.status}`);
      else {
        setTitle('');
        setUrl('');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function update(delivery_id: string, patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch('/api/deliveries/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_id, ...patch }),
      });
      if (res.ok) router.refresh();
      else {
        const j = await res.json().catch(() => ({}));
        alert(`Failed: ${j.error ?? res.status}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Create delivery (draft)</h2>
        <p className="text-xs text-slate-500">
          Tracks a deliverable + its external link (Pixieset / Frame.io / Vimeo / Drive). Creating or
          marking a delivery here records state only — it doesn’t send to a client or publish.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_2fr_auto] sm:items-end">
          <div>
            <label className="label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)} disabled={busy}>
              {DELIVERY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Title (optional)</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} placeholder="MLS gallery" />
          </div>
          <div>
            <label className="label">External URL (optional)</label>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} placeholder="https://pixieset.com/…" />
          </div>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </button>
        </div>
      </form>

      {deliveries.length === 0 ? (
        <div className="card p-6 text-sm text-slate-500">No deliveries yet.</div>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {deliveries.map((d) => (
            <DeliveryRow key={d.id} d={d} busy={busy} onUpdate={update} />
          ))}
        </ul>
      )}
    </div>
  );

  function DeliveryRow({ d, busy, onUpdate }: { d: Delivery; busy: boolean; onUpdate: typeof update }) {
    const [url, setUrl] = useState(d.external_url ?? '');
    const dirty = url !== (d.external_url ?? '');
    return (
      <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <div className="min-w-[180px]">
          <div className="font-medium capitalize text-slate-800">{d.delivery_type.replace(/_/g, ' ')} · v{d.version_number}</div>
          {d.title && <div className="text-xs text-slate-500">{d.title}</div>}
        </div>
        <select
          className="rounded border-slate-200 text-xs"
          value={d.status}
          disabled={busy}
          onChange={(e) => onUpdate(d.id, { status: e.target.value })}
          title="Status"
        >
          {DELIVERY_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <span className={`pill ${STATUS_STYLE[d.status] ?? 'bg-slate-100 text-slate-600'} capitalize`}>
          {d.status.replace(/_/g, ' ')}
        </span>
        <input
          className="input flex-1 !py-1 text-xs"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          placeholder="https://…"
        />
        {d.external_url && (
          <a href={d.external_url} target="_blank" rel="noreferrer" className="text-ocean-700 hover:underline">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        {dirty && (
          <button className="btn-secondary !px-2 !py-1 text-xs" disabled={busy} onClick={() => onUpdate(d.id, { external_url: url })}>
            <Save className="h-3.5 w-3.5" /> Save
          </button>
        )}
      </li>
    );
  }
}
