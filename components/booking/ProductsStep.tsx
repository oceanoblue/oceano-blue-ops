'use client';

import { useEffect, useState } from 'react';
import { X, Plus, Check } from 'lucide-react';
import { fmtCents } from '@/lib/utils/format';
import type { Product, SelectedItem } from '@/lib/booking/types';

export function ProductsStep({
  sqft,
  items,
  onBack,
  onChange,
  onComplete,
  onLoaded,
}: {
  sqft: number;
  items: SelectedItem[];
  onBack: () => void;
  onChange: (items: SelectedItem[]) => void;
  onComplete: () => void;
  onLoaded?: (products: Product[]) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailFor, setDetailFor] = useState<Product | null>(null);
  const [showAddons, setShowAddons] = useState<Product | null>(null);

  useEffect(() => {
    fetch(`/api/products?sqft=${sqft}`)
      .then((r) => r.json())
      .then((d) => {
        setProducts(d.products ?? []);
        setLoading(false);
        onLoaded?.(d.products ?? []);
      })
      .catch(() => setLoading(false));
  }, [sqft, onLoaded]);

  const baseProducts = products.filter((p) => !p.is_addon);
  const itemIds = new Set(items.map((i) => i.product_id));

  function addItem(p: Product) {
    if (itemIds.has(p.id)) return;
    onChange([...items, { product_id: p.id, quantity: 1 }]);
    setDetailFor(null);
    // If the base product has recommended add-ons, show the upsell drawer
    if (p.recommended_addon_ids.length > 0 && !p.is_addon) {
      setShowAddons(p);
    }
  }

  function removeItem(id: string) {
    onChange(items.filter((i) => i.product_id !== id));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ocean-950">Create your order</h1>
          <p className="text-sm text-slate-600">Choose services for this property</p>
        </div>

        {loading ? (
          <div className="text-sm text-slate-500">Loading products…</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {baseProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                selected={itemIds.has(p.id)}
                onClick={() => setDetailFor(p)}
              />
            ))}
          </div>
        )}

        <div className="flex gap-2 justify-between pt-2">
          <button className="btn-ghost" onClick={onBack}>← Back</button>
          <button className="btn-primary" disabled={items.length === 0} onClick={onComplete}>
            Continue to Scheduling →
          </button>
        </div>
      </div>

      {detailFor && (
        <Drawer onClose={() => setDetailFor(null)} title={detailFor.name}>
          <ProductGallery product={detailFor} />
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            {detailFor.long_description ?? detailFor.short_description}
          </p>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-ocean-950">{fmtCents(detailFor.price_cents)}</span>
            {detailFor.duration_minutes > 0 && (
              <span className="text-sm text-slate-500">· {detailFor.duration_minutes} min</span>
            )}
          </div>
          <div className="mt-auto pt-6">
            {itemIds.has(detailFor.id) ? (
              <button className="btn-secondary w-full" onClick={() => removeItem(detailFor.id)}>
                <X className="h-4 w-4" /> Remove from order
              </button>
            ) : (
              <button className="btn-primary w-full" onClick={() => addItem(detailFor)}>
                <Plus className="h-4 w-4" /> Add to Order
              </button>
            )}
          </div>
        </Drawer>
      )}

      {showAddons && (
        <Drawer
          onClose={() => setShowAddons(null)}
          title="Add-ons"
          subtitle={
            <>
              Reduce days on market by up to <span className="text-emerald-700 font-medium">30%</span> with these add-ons
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {showAddons.recommended_addon_ids
              .map((id) => products.find((p) => p.id === id))
              .filter((p): p is Product => !!p)
              .map((p) => (
                <AddonCard
                  key={p.id}
                  product={p}
                  selected={itemIds.has(p.id)}
                  onToggle={() => (itemIds.has(p.id) ? removeItem(p.id) : addItem(p))}
                />
              ))}
          </div>
          <div className="mt-auto pt-4">
            <button className="btn-primary w-full" onClick={() => setShowAddons(null)}>
              Continue
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}

function ProductCard({
  product,
  selected,
  onClick,
}: {
  product: Product;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`card overflow-hidden text-left transition hover:ring-2 ${
        selected ? 'ring-2 ring-ocean-500' : 'ring-1 ring-slate-200'
      }`}
    >
      {product.cover_image_url ? (
        <img src={product.cover_image_url} alt="" className="aspect-[4/3] w-full object-cover" />
      ) : (
        <div className="aspect-[4/3] w-full bg-gradient-to-br from-ocean-100 to-ocean-50 grid place-items-center text-ocean-700 text-xs uppercase tracking-wide">
          {product.kind}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-slate-900">{product.name}</h3>
          <span className="pill bg-slate-100 text-slate-700 capitalize">{product.kind}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600 line-clamp-2">{product.short_description}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-base font-semibold text-ocean-900">{fmtCents(product.price_cents)}</span>
          {selected ? (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-700 font-medium">
              <Check className="h-4 w-4" /> Added
            </span>
          ) : (
            <span className="text-sm text-ocean-700">View →</span>
          )}
        </div>
      </div>
    </button>
  );
}

function AddonCard({
  product,
  selected,
  onToggle,
}: {
  product: Product;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`card p-4 ${selected ? 'ring-2 ring-ocean-500' : ''}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{product.kind}</div>
      <div className="mt-1 font-medium">{product.name}</div>
      <div className="mt-1 text-sm text-slate-600 line-clamp-2">{product.short_description}</div>
      <div className="mt-3 flex items-center justify-between">
        <span className="font-semibold">{fmtCents(product.price_cents)}</span>
        <button
          className={selected ? 'btn-secondary text-sm' : 'btn-primary text-sm'}
          onClick={onToggle}
        >
          {selected ? 'Remove' : 'Add'}
        </button>
      </div>
    </div>
  );
}

function ProductGallery({ product }: { product: Product }) {
  const images = [product.cover_image_url, ...(product.gallery_image_urls ?? [])].filter(
    (u): u is string => !!u
  );
  const [idx, setIdx] = useState(0);
  if (images.length === 0) {
    return (
      <div className="aspect-[4/3] w-full rounded-lg bg-gradient-to-br from-ocean-100 to-ocean-50 grid place-items-center text-ocean-700 text-xs uppercase tracking-wide">
        {product.kind}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[idx]} alt="" className="h-full w-full object-cover" />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((url, i) => (
            <button
              key={url}
              onClick={() => setIdx(i)}
              className={`shrink-0 h-14 w-20 overflow-hidden rounded-md ring-2 transition ${
                i === idx ? 'ring-ocean-500' : 'ring-transparent hover:ring-slate-200'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Drawer({
  onClose,
  title,
  subtitle,
  children,
}: {
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[480px] bg-white p-6 shadow-xl flex flex-col overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ocean-950">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 flex-1 flex flex-col">{children}</div>
      </aside>
    </>
  );
}
