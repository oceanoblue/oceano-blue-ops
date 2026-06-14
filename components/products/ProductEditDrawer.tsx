'use client';

import { useEffect, useState } from 'react';
import { X, Trash2, Upload, Plus, Image as ImageIcon, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';

interface ProductRow {
  id?: string;
  slug: string;
  name: string;
  kind: string;
  short_description: string | null;
  long_description: string | null;
  cover_image_url: string | null;
  gallery_image_urls: string[];
  is_addon: boolean;
  is_active: boolean;
  base_price_cents: number;
  duration_minutes: number;
  sort_order: number;
}

interface PricingTier {
  id?: string;
  min_sqft: number | null;
  max_sqft: number | null;
  price_cents: number;
}

const KINDS = ['photo', 'video', 'floor_plan', 'tour', 'fee', 'addon'];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const emptyProduct: ProductRow = {
  slug: '',
  name: '',
  kind: 'photo',
  short_description: '',
  long_description: '',
  cover_image_url: null,
  gallery_image_urls: [],
  is_addon: false,
  is_active: true,
  base_price_cents: 0,
  duration_minutes: 0,
  sort_order: 100,
};

export function ProductEditDrawer({
  product,
  createKind,
  onClose,
  onSaved,
}: {
  product: ProductRow | null;
  createKind: 'addon' | 'service' | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<ProductRow>(() =>
    product ?? { ...emptyProduct, is_addon: createKind === 'addon', kind: createKind === 'addon' ? 'addon' : 'photo' }
  );
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load tiers if editing existing product
  useEffect(() => {
    if (!product?.id) return;
    const supabase = createClient();
    supabase
      .from('pricing_tiers')
      .select('id, min_sqft, max_sqft, price_cents')
      .eq('product_id', product.id)
      .order('min_sqft', { ascending: true, nullsFirst: true })
      .then(({ data }) => setTiers((data as any) ?? []));
  }, [product?.id]);

  async function uploadImages(files: FileList | null, target: 'cover' | 'gallery') {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      const r = await fetch('/api/products/upload', { method: 'POST', body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'upload failed');
      if (target === 'cover') {
        setDraft((d) => ({ ...d, cover_image_url: data.urls[0] }));
      } else {
        setDraft((d) => ({ ...d, gallery_image_urls: [...d.gallery_image_urls, ...data.urls] }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  function removeGalleryImage(url: string) {
    setDraft((d) => ({ ...d, gallery_image_urls: d.gallery_image_urls.filter((u) => u !== url) }));
  }

  function addTier() {
    setTiers((t) => [...t, { min_sqft: null, max_sqft: null, price_cents: draft.base_price_cents }]);
  }
  function updateTier(idx: number, patch: Partial<PricingTier>) {
    setTiers((t) => t.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function removeTier(idx: number) {
    setTiers((t) => t.filter((_, i) => i !== idx));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const slug = draft.slug || slugify(draft.name);
      if (!slug || !draft.name) {
        throw new Error('Name is required.');
      }
      const payload = { ...draft, slug };
      let productId = draft.id;
      if (productId) {
        // Form draft payload (kind is a free string from a select); written as-is.
        const { error } = await supabase.from('products').update(payload as any).eq('id', productId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('products').insert(payload as any).select('id').single();
        if (error) throw error;
        productId = (data as any).id;
      }
      // Replace tiers (simpler than diffing)
      if (productId) {
        await supabase.from('pricing_tiers').delete().eq('product_id', productId);
        if (tiers.length) {
          await supabase.from('pricing_tiers').insert(
            tiers.map((t) => ({
              product_id: productId,
              min_sqft: t.min_sqft,
              max_sqft: t.max_sqft,
              price_cents: t.price_cents,
            }))
          );
        }
      }
      await onSaved();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct() {
    if (!draft.id) return;
    if (!confirm(`Delete ${draft.name}? This can't be undone.`)) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from('products').delete().eq('id', draft.id);
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      await onSaved();
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[640px] bg-white shadow-xl flex flex-col">
        <header className="flex items-center justify-between gap-3 p-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-semibold text-ocean-950">
              {draft.id ? 'Edit' : 'New'} {draft.is_addon ? 'add-on' : 'service'}
            </h2>
            <p className="text-xs text-slate-500">
              Shown to clients in the booking wizard.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Cover image */}
          <section>
            <label className="label">Cover image</label>
            {draft.cover_image_url ? (
              <div className="relative aspect-[4/3] w-full max-w-md rounded-lg overflow-hidden border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.cover_image_url} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => setDraft((d) => ({ ...d, cover_image_url: null }))}
                  className="absolute top-2 right-2 bg-white/90 rounded p-1 text-slate-700 hover:bg-white"
                  aria-label="Remove cover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex aspect-[4/3] max-w-md cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:bg-slate-50">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadImages(e.target.files, 'cover')}
                />
                <div className="text-center">
                  <Upload className="mx-auto h-6 w-6" />
                  <p className="mt-2 text-sm">Upload cover image</p>
                </div>
              </label>
            )}
          </section>

          {/* Basics */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">Name <span className="text-rose-600">*</span></label>
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: draft.slug || slugify(e.target.value) })}
                placeholder="Interior/Exterior Photography"
              />
            </div>
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Duration (min)</label>
              <input
                type="number"
                min={0}
                className="input"
                value={draft.duration_minutes}
                onChange={(e) => setDraft({ ...draft, duration_minutes: +e.target.value })}
              />
            </div>
            <div>
              <label className="label">Base price ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input"
                value={draft.base_price_cents / 100}
                onChange={(e) => setDraft({ ...draft, base_price_cents: Math.round(+e.target.value * 100) })}
              />
            </div>
            <div>
              <label className="label">Sort order</label>
              <input
                type="number"
                className="input"
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: +e.target.value })}
              />
            </div>
          </section>

          <section>
            <label className="label">Short description</label>
            <input
              className="input"
              value={draft.short_description ?? ''}
              onChange={(e) => setDraft({ ...draft, short_description: e.target.value })}
              placeholder="One-line summary shown on the card"
            />
          </section>

          <section>
            <label className="label">Long description</label>
            <textarea
              className="input"
              rows={4}
              value={draft.long_description ?? ''}
              onChange={(e) => setDraft({ ...draft, long_description: e.target.value })}
              placeholder="Full description shown in the detail drawer"
            />
          </section>

          {/* Pricing tiers */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">Pricing tiers (by sqft)</label>
              <button onClick={addTier} className="text-sm text-ocean-700 hover:underline inline-flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add tier
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-2">
              Optional. Overrides base price when the property sqft falls in the range.
              Leave min/max empty for open-ended.
            </p>
            {tiers.length === 0 ? (
              <p className="text-sm text-slate-400">No tiers — uses base price for all properties.</p>
            ) : (
              <div className="space-y-2">
                {tiers.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 w-12">Tier {i + 1}</span>
                    <input
                      type="number"
                      placeholder="Min"
                      className="input w-24"
                      value={t.min_sqft ?? ''}
                      onChange={(e) => updateTier(i, { min_sqft: e.target.value === '' ? null : +e.target.value })}
                    />
                    <span className="text-slate-500">to</span>
                    <input
                      type="number"
                      placeholder="Max"
                      className="input w-24"
                      value={t.max_sqft ?? ''}
                      onChange={(e) => updateTier(i, { max_sqft: e.target.value === '' ? null : +e.target.value })}
                    />
                    <span className="text-slate-500">sqft →</span>
                    <input
                      type="number"
                      step="0.01"
                      className="input w-24"
                      value={t.price_cents / 100}
                      onChange={(e) => updateTier(i, { price_cents: Math.round(+e.target.value * 100) })}
                    />
                    <span className="text-slate-500">$</span>
                    <button onClick={() => removeTier(i)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Gallery */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">Gallery images</label>
              <label className="text-sm text-ocean-700 hover:underline inline-flex items-center gap-1 cursor-pointer">
                <Upload className="h-3 w-3" /> Add images
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadImages(e.target.files, 'gallery')}
                />
              </label>
            </div>
            {draft.gallery_image_urls.length === 0 ? (
              <p className="text-sm text-slate-400 inline-flex items-center gap-1">
                <ImageIcon className="h-4 w-4" /> No gallery images yet.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {draft.gallery_image_urls.map((url) => (
                  <div key={url} className="relative aspect-square rounded-md overflow-hidden border border-slate-200 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button
                      onClick={() => removeGalleryImage(url)}
                      className="absolute top-1 right-1 bg-white/90 rounded p-1 text-slate-700 opacity-0 group-hover:opacity-100 transition"
                      aria-label="Remove image"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Active toggle */}
          <section className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Active</div>
              <p className="text-xs text-slate-500">Inactive products are hidden from clients.</p>
            </div>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, is_active: !draft.is_active })}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition',
                draft.is_active
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-700'
              )}
            >
              {draft.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {draft.is_active ? 'Visible' : 'Hidden'}
            </button>
          </section>

          {error && (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-3">
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 p-4 border-t border-slate-200">
          <div>
            {draft.id && (
              <button
                onClick={deleteProduct}
                className="btn-ghost text-sm text-rose-700 hover:bg-rose-50"
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={busy || uploading}>
              {busy ? 'Saving…' : uploading ? 'Uploading…' : 'Save'}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}
