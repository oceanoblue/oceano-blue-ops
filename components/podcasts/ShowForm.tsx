'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Save } from 'lucide-react';

export type ClientOption = { id: string; full_name: string | null };

export type ShowValues = {
  id?: string;
  name: string;
  slug: string;
  client_id: string | null;
  hosts: string;
  description: string;
  default_language: string;
};

const EMPTY: ShowValues = { name: '', slug: '', client_id: null, hosts: '', description: '', default_language: 'en' };

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/**
 * Create/edit a podcast show. The slug is the pipeline key: Make's intake
 * matches `show_slug` against it, so episodes land on the right show (and
 * client) automatically.
 */
export function ShowForm({
  clients,
  initial,
  onDone,
}: {
  clients: ClientOption[];
  initial?: ShowValues;
  onDone?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(initial?.id);
  const [v, setV] = useState<ShowValues>(initial ?? EMPTY);
  const [slugTouched, setSlugTouched] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ShowValues>(key: K, value: ShowValues[K]) {
    setV((p) => ({ ...p, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/podcasts/shows', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { show_id: initial!.id } : {}),
          name: v.name,
          slug: v.slug,
          client_id: v.client_id,
          hosts: v.hosts || undefined,
          description: v.description || undefined,
          default_language: v.default_language || 'en',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error === 'slug_taken' ? 'That slug is already in use.' : `Failed: ${json.error ?? res.status}`);
        return;
      }
      if (!editing) setV(EMPTY);
      onDone?.();
      router.refresh();
    } catch {
      setError('Failed: network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Show name</label>
          <input
            className="input"
            required
            value={v.name}
            disabled={busy}
            placeholder="Defining Wealth"
            onChange={(e) => {
              set('name', e.target.value);
              if (!slugTouched) set('slug', slugify(e.target.value));
            }}
          />
        </div>
        <div>
          <label className="label">Slug (pipeline key)</label>
          <input
            className="input font-mono text-xs"
            required
            value={v.slug}
            disabled={busy}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="lowercase letters, numbers and hyphens"
            placeholder="defining-wealth"
            onChange={(e) => {
              setSlugTouched(true);
              set('slug', e.target.value);
            }}
          />
          <p className="mt-1 text-xs text-slate-400">Must match the show_slug the Make scenario sends.</p>
        </div>
        <div>
          <label className="label">Client</label>
          <select
            className="input"
            value={v.client_id ?? ''}
            disabled={busy}
            onChange={(e) => set('client_id', e.target.value || null)}
          >
            <option value="">— internal / no client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name ?? c.id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Hosts</label>
          <input className="input" value={v.hosts} disabled={busy} placeholder="Jane Doe, John Roe" onChange={(e) => set('hosts', e.target.value)} />
        </div>
        <div>
          <label className="label">Default language</label>
          <select className="input" value={v.default_language} disabled={busy} onChange={(e) => set('default_language', e.target.value)}>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="pt">Portuguese</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input" rows={2} value={v.description} disabled={busy} onChange={(e) => set('description', e.target.value)} />
      </div>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {editing ? 'Save show' : 'Create show'}
      </button>
    </form>
  );
}
