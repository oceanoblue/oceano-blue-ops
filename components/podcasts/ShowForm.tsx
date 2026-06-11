'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Save, ImagePlus } from 'lucide-react';

export type ClientOption = { id: string; full_name: string | null };

export type ShowValues = {
  id?: string;
  name: string;
  slug: string;
  client_id: string | null;
  hosts: string;
  description: string;
  default_language: string;
  tagline: string;
  mood: string;
  tone: string;
  brand_color: string;
  logo_url: string | null;
};

const EMPTY: ShowValues = {
  name: '', slug: '', client_id: null, hosts: '', description: '', default_language: 'en',
  tagline: '', mood: '', tone: '', brand_color: '', logo_url: null,
};

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

const LOGO_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/**
 * Create/edit a podcast show with branding. The slug is the pipeline key (Make's
 * intake matches show_slug against it). Mood/tone feed the AI copy; brand color
 * and logo drive the dashboard. Logo upload only works once the show exists, so
 * it's shown in edit mode.
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
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
          tagline: v.tagline || undefined,
          mood: v.mood || undefined,
          tone: v.tone || undefined,
          brand_color: v.brand_color || '',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error === 'slug_taken' ? 'That slug is already in use.' : `Failed: ${json.error ?? res.status}`);
        return;
      }
      // Surface the Dropbox auto-folder result on create (Phase B).
      const dbx = json.dropbox;
      if (!editing && dbx) {
        if (dbx.status === 'created') setInfo(`Dropbox folder created: ${dbx.path}`);
        else if (dbx.status === 'exists') setInfo(`Dropbox folder already existed: ${dbx.path}`);
        else if (dbx.status === 'failed') setInfo('Show created, but the Dropbox folder could not be created — make it manually.');
        // 'not_configured' → stay silent (integration not set up yet)
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

  async function uploadLogo(file: File) {
    if (!initial?.id) return;
    if (!LOGO_MIME.has(file.type)) {
      setError('Logo must be PNG, JPG, WebP or SVG.');
      return;
    }
    setLogoBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToBase64(file);
      const res = await fetch('/api/podcasts/shows/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_id: initial.id, content_base64: dataUrl, mime: file.type }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error === 'file_too_large' ? 'Logo is too large (max 3MB).' : `Logo upload failed: ${json.error ?? res.status}`);
        return;
      }
      set('logo_url', json.logo_url);
      router.refresh();
    } catch {
      setError('Logo upload failed: network error');
    } finally {
      setLogoBusy(false);
    }
  }

  const accent = /^#?[0-9a-fA-F]{6}$/.test(v.brand_color) ? `#${v.brand_color.replace('#', '')}` : '#1e88e5';

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          {info}
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
        <div>
          <label className="label">Tagline</label>
          <input className="input" value={v.tagline} disabled={busy} placeholder="Wealth, demystified." onChange={(e) => set('tagline', e.target.value)} />
        </div>
      </div>

      {/* Branding block — drives AI copy tone + dashboard accents */}
      <div className="rounded-md border border-slate-200 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Branding & voice</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Mood / vibe</label>
            <input className="input" value={v.mood} disabled={busy} placeholder="warm, candid, upbeat" onChange={(e) => set('mood', e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">Feeds the AI copy so titles/descriptions match the show.</p>
          </div>
          <div>
            <label className="label">Writing tone</label>
            <input className="input" value={v.tone} disabled={busy} placeholder="expert but friendly, no jargon" onChange={(e) => set('tone', e.target.value)} />
          </div>
          <div>
            <label className="label">Brand color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 cursor-pointer rounded border border-slate-200"
                value={accent}
                disabled={busy}
                onChange={(e) => set('brand_color', e.target.value)}
                aria-label="Brand color"
              />
              <input
                className="input font-mono text-xs"
                value={v.brand_color}
                disabled={busy}
                placeholder="#1e88e5"
                onChange={(e) => set('brand_color', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Logo</label>
            {editing ? (
              <div className="flex items-center gap-3">
                {v.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.logo_url} alt="Show logo" className="h-10 w-10 rounded object-contain ring-1 ring-slate-200" />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded bg-slate-100 text-slate-400">
                    <ImagePlus className="h-4 w-4" />
                  </div>
                )}
                <label className="btn-secondary cursor-pointer text-xs">
                  {logoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {v.logo_url ? 'Replace' : 'Upload'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    disabled={logoBusy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.currentTarget.value = ''; }}
                  />
                </label>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Create the show first, then upload a logo here.</p>
            )}
          </div>
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
