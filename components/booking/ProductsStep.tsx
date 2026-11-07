'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { X, Plus, Check } from 'lucide-react';
import { fmtCents } from '@/lib/utils/format';
import { selectionProblem } from '@/lib/booking/service-selection';
import { bookingDescription, serviceCategory } from '@/lib/booking/presentation';
import type { Product, SelectedItem } from '@/lib/booking/types';

const MAIN_SERVICES = ['interior_exterior_photo', 'cinematic_video', 'floor_plan'];

export function ProductsStep({
  sqft, items, onBack, onChange, onComplete, onLoaded, audience = 'real_estate',
}: {
  sqft: number;
  items: SelectedItem[];
  onBack: () => void;
  onChange: (items: SelectedItem[]) => void;
  onComplete: () => void;
  onLoaded?: (products: Product[]) => void;
  audience?: 'real_estate' | 'architectural';
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [detailFor, setDetailFor] = useState<Product | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    // Do not show prices from the previous property size while refreshing.
    onLoaded?.([]);
    fetch(`/api/products?sqft=${sqft}&audience=${audience}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error('catalog_unavailable'); return r.json(); })
      .then((d) => {
        if (controller.signal.aborted) return;
        setProducts(d.products ?? []);
        onLoaded?.(d.products ?? []);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sqft, audience, onLoaded, retry]);

  const itemIds = new Set(items.map((i) => i.product_id));
  const selectedProducts = products.filter((p) => itemIds.has(p.id));
  const baseProducts = products.filter((p) => !p.is_addon);
  const primaryProducts = audience === 'real_estate'
    ? MAIN_SERVICES.flatMap((slug) => baseProducts.filter((p) => p.slug === slug))
    : baseProducts;
  const otherProducts = audience === 'real_estate'
    ? baseProducts.filter((p) => !MAIN_SERVICES.includes(p.slug))
    : [];
  const recommendedIds = new Set(selectedProducts.flatMap((p) => p.recommended_addon_ids));
  const hasPhotoOrVideo = selectedProducts.some((p) => ['interior_exterior_photo', 'cinematic_video'].includes(p.slug));
  const addons = products.filter((p) => p.is_addon && (
    itemIds.has(p.id) || recommendedIds.has(p.id) ||
    (hasPhotoOrVideo && ['drone_photography', 'drone_video'].includes(p.slug))
  ));
  const missingItems = items.some((item) => !products.some((product) => product.id === item.product_id));
  const problem = missingItems
    ? 'A selected service is no longer available. Remove it from your booking to continue.'
    : selectionProblem(selectedProducts);

  function toggleItem(p: Product) {
    onChange(itemIds.has(p.id)
      ? items.filter((i) => i.product_id !== p.id)
      : [...items, { product_id: p.id, quantity: 1 }]);
    setDetailFor(null);
  }

  function unavailableReason(p: Product) {
    return itemIds.has(p.id) ? null : selectionProblem([...selectedProducts, p]);
  }

  function cards(list: Product[]) {
    return list.map((p) => (
      <ProductCard key={p.id} product={p} selected={itemIds.has(p.id)}
        unavailableReason={unavailableReason(p)} onToggle={() => toggleItem(p)}
        onDetails={() => setDetailFor(p)} />
    ));
  }

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ocean-950">Choose your services</h1>
        <p className="mt-2 text-sm text-slate-600">
          {audience === 'real_estate'
            ? 'Choose photos, a walkthrough video, a floor plan, or a combination. Add only what you need.'
            : 'Choose the services you need for your project, then select a date and time.'}
        </p>
        <p className="mt-2 text-sm font-medium text-ocean-800">
          Prices shown are for your {sqft.toLocaleString('en-US')} sq ft property.
        </p>
      </div>

      {loading ? (
        <p role="status" className="text-sm text-slate-500">Loading services…</p>
      ) : error ? (
        <div role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          <p>We could not load the services. Your property details are saved.</p>
          <button className="btn-secondary mt-2" onClick={() => setRetry((value) => value + 1)}>Try again</button>
        </div>
      ) : baseProducts.length === 0 ? (
        <p className="text-sm text-slate-600">No services are available online right now. Please contact the office.</p>
      ) : (
        <>
          <section aria-label="Main services" className="grid gap-4 sm:grid-cols-2">
            {cards(primaryProducts)}
          </section>

          <section aria-labelledby="booking-addons" className="rounded-xl border border-ocean-200 bg-ocean-50/60 p-4 sm:p-5">
            <h2 id="booking-addons" className="text-lg font-semibold text-ocean-950">Optional add-ons</h2>
            <p className="mt-1 text-sm text-slate-600">
              {addons.length > 0
                ? 'These extras are priced separately and added to your total. You can skip them.'
                : 'Choose a main service above to see the available extras. You can skip add-ons.'}
            </p>
            {addons.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{cards(addons)}</div>
            ) : audience === 'real_estate' ? (
              <p className="mt-3 text-sm text-ocean-900">
                Drone coverage is an optional extra with photos or a walkthrough video. For aerial coverage only, choose the aerial package below.
              </p>
            ) : null}
          </section>

          {otherProducts.length > 0 && (
            <section aria-labelledby="booking-other-services">
              <h2 id="booking-other-services" className="text-lg font-semibold text-ocean-950">Other services</h2>
              <p className="mt-1 text-sm text-slate-600">Aerial coverage, social media video, and return visits.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">{cards(otherProducts)}</div>
            </section>
          )}
        </>
      )}

      {!loading && !error && problem && items.length > 0 && (
        <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{problem}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button className="btn-ghost" onClick={onBack}>← Property details</button>
        <button className="btn-primary" disabled={loading || error || items.length === 0 || !!problem} onClick={onComplete}>
          Choose a date &amp; time →
        </button>
      </div>

      {detailFor && (
        <ServiceDetails key={detailFor.id} product={detailFor} selected={itemIds.has(detailFor.id)}
          unavailableReason={unavailableReason(detailFor)} onToggle={() => toggleItem(detailFor)}
          onClose={() => setDetailFor(null)} />
      )}
    </div>
  );
}

function ProductCard({ product, selected, unavailableReason, onToggle, onDetails }: {
  product: Product;
  selected: boolean;
  unavailableReason: string | null;
  onToggle: () => void;
  onDetails: () => void;
}) {
  return (
    <article className={`card flex min-w-0 flex-col p-4 sm:p-5 ${selected ? 'ring-2 ring-ocean-600' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
        <span className="text-slate-500">{serviceCategory(product)}</span>
        {selected && <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-4 w-4" /> Selected</span>}
      </div>
      <h3 className="mt-2 text-base font-semibold leading-snug text-slate-900">{product.name}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{bookingDescription(product)}</p>
      {product.slug === 'three_d_floor_plan' && <p className="mt-2 text-sm font-medium text-ocean-800">Floor plan included. Choose this or the separate Floor Plan service.</p>}
      <div className="mt-4 text-lg font-semibold text-ocean-950">
        {fmtCents(product.price_cents)}
        {product.is_addon && <span className="ml-1 text-xs font-normal text-slate-600">add-on</span>}
      </div>
      {unavailableReason && <p className="mt-2 text-sm text-amber-900">{unavailableReason}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
        <button className="text-sm font-medium text-ocean-700 underline underline-offset-4" onClick={onDetails} aria-label={`Details for ${product.name}`}>Details</button>
        <button className={selected ? 'btn-secondary text-sm' : 'btn-primary text-sm'} onClick={onToggle}
          disabled={!!unavailableReason} aria-label={`${selected ? 'Remove' : 'Add'} ${product.name}`} aria-pressed={selected}>
          {selected ? <><X className="h-4 w-4" /> Remove</> : <><Plus className="h-4 w-4" /> Add</>}
        </button>
      </div>
    </article>
  );
}

function ServiceDetails({ product, selected, unavailableReason, onToggle, onClose }: {
  product: Product;
  selected: boolean;
  unavailableReason: string | null;
  onToggle: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { node?.close(); document.body.style.overflow = overflow; };
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-lg bg-white p-0 shadow-xl backdrop:bg-black/30">
      <div className="flex min-h-full flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-xl font-semibold text-ocean-950">{product.name}</h2>
          <button onClick={onClose} aria-label="Close service details" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-4 text-sm font-medium leading-relaxed text-ocean-900">{bookingDescription(product)}</p>
        {product.long_description && <p className="mt-3 text-sm leading-relaxed text-slate-600">{product.long_description}</p>}
        <div className="mt-4"><ProductGallery product={product} /></div>
        <p className="mt-4 text-2xl font-semibold text-ocean-950">{fmtCents(product.price_cents)}{product.is_addon && <span className="ml-2 text-sm font-normal">add-on</span>}</p>
        {unavailableReason && <p className="mt-3 text-sm text-amber-900">{unavailableReason}</p>}
        <button className={`${selected ? 'btn-secondary' : 'btn-primary'} mt-6 w-full`} onClick={onToggle} disabled={!!unavailableReason}>
          {selected ? 'Remove from booking' : 'Add to booking'}
        </button>
      </div>
    </dialog>
  );
}

function ProductGallery({ product }: { product: Product }) {
  const images = [...new Set([product.cover_image_url, ...(product.gallery_image_urls ?? [])].filter((url): url is string => !!url))];
  const [index, setIndex] = useState(0);
  if (images.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="aspect-4/3 overflow-hidden rounded-lg bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[index]} alt={`${product.name} example`} className="h-full w-full object-cover" />
      </div>
      {images.length > 1 && <div className="flex gap-2 overflow-x-auto p-1">
        {images.map((url, i) => <button key={url} onClick={() => setIndex(i)} aria-label={`View example ${i + 1}`} aria-pressed={i === index}
          className={`h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2 ${i === index ? 'ring-ocean-500' : 'ring-transparent'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" />
        </button>)}
      </div>}
    </div>
  );
}
