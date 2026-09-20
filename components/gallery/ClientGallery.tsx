'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Image as ImageIcon, ChevronDown, LayoutGrid, Rows3, X, ChevronLeft, ChevronRight, Lock, ShieldCheck, Loader2 } from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { groupByRoom, roomLabel } from '@/lib/photos/rooms';
import { MediaRoom, type DeliverableView } from '@/components/portal/MediaRoom';
import { MarketingLinks } from '@/components/marketing/MarketingLinks';
import { RevisionRequests } from '@/components/gallery/RevisionRequests';

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

type DeliverySize = 'full' | 'print' | 'web';

const SIZE_OPTIONS: { value: DeliverySize; label: string; hint: string }[] = [
  { value: 'full', label: 'Full resolution', hint: 'Original delivered files — archive & large print' },
  { value: 'print', label: 'Print resolution', hint: '3000px — flyers, brochures, standard prints' },
  { value: 'web', label: 'Web resolution', hint: '2048px — MLS & web portals' },
];

interface GalleryPhoto {
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
  room_type: string | null;
  url: string | null;
}

interface Paywall {
  watermarked?: boolean;
  active: boolean;
  paid: boolean;
  price_cents: number;
  currency: string;
}

export interface GalleryData {
  order: { id: string; order_number: number; status?: string; scheduled_at?: string | null };
  listing: { address_line1: string; city: string; state: string; zip: string } | null;
  photos: GalleryPhoto[];
  deliverables?: DeliverableView[];
  paywall?: Paywall;
}

export function ClientGallery({ token, initialData, demo = false }: { token: string; initialData?: GalleryData; demo?: boolean }) {
  const [data, setData] = useState<GalleryData | null>(initialData ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<GalleryPhoto | null>(null);
  const [size, setSize] = useState<DeliverySize>('full');
  const [sizeOpen, setSizeOpen] = useState(false);
  // Default to the single "all photos" grid; clients can switch to the
  // room-organized view via the toggle. (Grouping only appears when photos have
  // been classified — hasRooms gates the grouped render below.)
  const [byRoom, setByRoom] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [revisionPhoto, setRevisionPhoto] = useState<string>();

  const load = useCallback(async (): Promise<GalleryData | null> => {
    if (demo) return initialData ?? null;
    try {
      const r = await fetch(`/api/delivery/${token}`);
      const d = await r.json();
      if (d.error) {
        setErr(d.error);
        return null;
      }
      setData(d);
      return d as GalleryData;
    } catch (e) {
      setErr(String(e));
      return null;
    }
  }, [token, demo, initialData]);

  useEffect(() => {
    let cancelled = false;
    const justPaid =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('paid') === '1';
    (async () => {
      let d = await load();
      // Stripe redirects back on success before its webhook has necessarily
      // marked the order paid — poll briefly until the lock clears.
      if (justPaid && d?.paywall?.active) {
        for (let i = 0; i < 6 && !cancelled; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          d = await load();
          if (!d?.paywall?.active) break;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function unlock() {
    if (demo) return;
    setUnlocking(true);
    try {
      const r = await fetch(`/api/delivery/${token}/checkout`, { method: 'POST' });
      const j = await r.json();
      if (j.paid) { await load(); setUnlocking(false); return; }
      if (j.url) {
        window.location.href = j.url;
        return;
      }
      setCheckoutError(j.error ? 'Checkout is unavailable right now. Please contact our team.' : 'Could not open checkout. Please try again.');
      setUnlocking(false);
    } catch {
      setCheckoutError('Could not connect to checkout. Please try again.');
      setUnlocking(false);
    }
  }

  // The flat photo order as currently displayed (grouped-by-room or flat), so
  // lightbox prev/next walks the same sequence the client sees.
  const orderedPhotos = useCallback((): GalleryPhoto[] => {
    if (!data) return [];
    const grouped = byRoom && data.photos.some((p) => p.room_type);
    return grouped ? groupByRoom(data.photos).flatMap((g) => g.photos) : data.photos;
  }, [data, byRoom]);

  const step = useCallback(
    (delta: number) => {
      setLightbox((cur) => {
        if (!cur) return cur;
        const order = orderedPhotos();
        const i = order.findIndex((p) => p.id === cur.id);
        if (i === -1) return cur;
        return order[(i + delta + order.length) % order.length] ?? cur;
      });
    },
    [orderedPhotos]
  );

  // Keyboard control while the lightbox is open: Esc closes, arrows navigate.
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, step]);

  if (err) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 px-6">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">Gallery unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">
            {err === 'expired' ? 'This link has expired. Please contact us for a new one.' :
             err === 'not_found' ? "We couldn't find this gallery." : 'Please try again or contact our team for help.'}
          </p>
          <Link href="/" className="btn-secondary mt-6 inline-flex">Back home</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-5">
            <div className="h-3 w-24 rounded bg-slate-200 animate-pulse" />
            <div className="mt-2 h-6 w-72 max-w-full rounded bg-slate-200 animate-pulse" />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/2] rounded-lg bg-slate-200 animate-pulse" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  const hasRooms = data.photos.some((p) => p.room_type);
  const roomGroups = groupByRoom(data.photos);
  const locked = !!data.paywall?.active;
  const price = data.paywall?.price_cents ?? 0;

  const UnlockButton = ({ className = 'btn-primary' }: { className?: string }) => (
    <button type="button" onClick={unlock} disabled={unlocking || demo} className={className}>
      {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
      {unlocking ? 'Starting checkout…' : `Unlock downloads · ${money(price)}`}
    </button>
  );

  const PhotoTile = (p: GalleryPhoto) => (
    <button
      key={p.id}
      aria-label={`View ${p.filename}`}
      onClick={() => setLightbox(p)}
      className="group relative aspect-[3/2] overflow-hidden rounded-lg ring-1 ring-slate-200 shadow-soft transition-all duration-300 ease-swift hover:-translate-y-0.5 hover:shadow-lift hover:ring-ocean-400"
    >
      {p.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.url}
          alt={p.filename}
          className="h-full w-full object-cover transition-transform duration-500 ease-swift group-hover:scale-[1.04]"
          loading="lazy"
          draggable={!locked}
          onContextMenu={locked ? (e) => e.preventDefault() : undefined}
        />
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#f6f7f8]">
      {demo && <div className="bg-ocean-100 px-4 py-2 text-center text-xs text-ocean-900">Sample client gallery · Preview only · No payments or orders</div>}
      <header className="bg-[#102c3b] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-5 sm:px-8">
          <a href="https://oceanoblue.net" aria-label="Oceano Blue Media"><BrandLogo variant="white" className="h-8 w-auto" /></a>
          <div className="flex items-center gap-4"><Link href="/book" className="rounded-lg border border-white/30 px-3 py-2 text-sm hover:bg-white/10">Book another shoot</Link><a href="mailto:info@oceanoblue.net" className="text-xs text-white/80 hover:text-white">Need a hand?</a></div>
        </div>
      </header>
      <section className="relative isolate min-h-[300px] overflow-hidden bg-[#102c3b] sm:min-h-[420px]">
        {data.photos[0]?.url && <img src={data.photos[0].url} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0a202f] via-[#0a202f]/40 to-[#0a202f]/10" />
        <div className="mx-auto flex min-h-[300px] max-w-6xl flex-col justify-end px-5 pb-9 pt-16 text-white sm:min-h-[420px] sm:px-8 sm:pb-12">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/80">Your property. Beautifully presented.</p>
          <h1 className="max-w-3xl text-3xl font-normal leading-tight sm:text-5xl">{data.listing?.address_line1 || `Order #${data.order.order_number}`}</h1>
          <p className="mt-3 text-sm text-white/75">{data.listing ? [data.listing.city, data.listing.state, data.listing.zip].filter(Boolean).join(', ') : 'Your private media collection'}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs"><span className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5">{data.photos.length} photos</span>{!!data.deliverables?.length && <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5">{data.deliverables.length} media files</span>}<span className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5">Prepared by Oceano Blue Media</span></div>
        </div>
      </section>
      <nav aria-label="Gallery sections" className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-5 py-4 text-sm font-medium sm:px-8">
          {data.photos.length > 0 && <a href="#gallery-photos" className="shrink-0 text-ocean-800 hover:underline">Photos ({data.photos.length})</a>}
          {!!data.deliverables?.length && <a href="#gallery-media" className="shrink-0 text-ocean-800 hover:underline">Videos, tours & floor plans</a>}
          <a href="#gallery-marketing" className="shrink-0 text-ocean-800 hover:underline">Marketing</a>
          <a href="#gallery-order" className="shrink-0 text-ocean-800 hover:underline">Order & payment</a>
          {data.photos.length > 0 && <a href="#gallery-requests" className="shrink-0 text-ocean-800 hover:underline">Request changes</a>}
        </div>
      </nav>
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-xl font-semibold text-ocean-950">Your finished collection</h2><p className="mt-1 text-xs text-slate-500">{locked ? 'Explore your previews. Unlock downloads when you’re ready.' : 'Ready for your listing, your marketing, and what comes next.'}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            {hasRooms && (
              <button
                type="button"
                onClick={() => setByRoom((v) => !v)}
                className="btn-secondary"
                title={byRoom ? 'Show all photos in one grid' : 'Group photos by room'}
              >
                {byRoom ? <LayoutGrid className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
                {byRoom ? 'All photos' : 'By room'}
              </button>
            )}
            {locked ? (
              <UnlockButton />
            ) : data.photos.length > 0 ? (
              <>
                {/* Resolution selector — clients pick full / print / web */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSizeOpen((o) => !o)}
                    onBlur={() => setTimeout(() => setSizeOpen(false), 150)}
                    className="btn-secondary"
                    title="Choose download resolution"
                  >
                    {SIZE_OPTIONS.find((o) => o.value === size)?.label}
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  {sizeOpen && (
                    <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lift">
                      {SIZE_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => {
                            setSize(o.value);
                            setSizeOpen(false);
                          }}
                          className={`block w-full px-4 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                            o.value === size ? 'bg-ocean-50' : ''
                          }`}
                        >
                          <div className="text-sm font-medium text-ocean-950">{o.label}</div>
                          <div className="text-xs text-slate-500">{o.hint}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {demo ? <button className="btn-primary" disabled title="Sample gallery — downloads disabled"><Download className="h-4 w-4" />Download all ({data.photos.length})</button> : <a
                  href={`/api/delivery/${token}/download${size === 'full' ? '' : `?size=${size}`}`}
                  className="btn-primary" download title={SIZE_OPTIONS.find((o) => o.value === size)?.hint}
                ><Download className="h-4 w-4" /> Download all ({data.photos.length})</a>}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <main id="gallery-photos" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-8 sm:px-8">
        {checkoutError && <p role="alert" className="mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{checkoutError} <a className="underline" href="mailto:info@oceanoblue.net">Contact us</a></p>}
        {locked && (
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
                <Lock className="h-4 w-4" />
              </span>
              <div>
                <div className="font-medium text-ocean-950">{data.paywall?.watermarked ? 'These are watermarked previews' : 'Your gallery is ready to view'}</div>
                <p className="text-sm text-slate-600">
                  Complete payment to unlock downloads of the full-resolution files.
                </p>
              </div>
            </div>
            <UnlockButton className="btn-primary shrink-0" />
          </div>
        )}
        {data.paywall?.paid && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
            <ShieldCheck className="h-4 w-4" /> Payment received — downloads are unlocked. Thank you!
          </div>
        )}
        {data.photos.length === 0 && (data.deliverables?.length ?? 0) === 0 ? (
          <div className="card p-12 text-center text-slate-500">
            <ImageIcon className="mx-auto h-8 w-8 opacity-40" />
            <p className="mt-2">Nothing delivered yet.</p>
          </div>
        ) : byRoom && hasRooms ? (
          <div className="space-y-10">
            {roomGroups.map((g) => (
              <section key={g.label}>
                <h2 className="mb-3 flex items-baseline gap-2 border-b border-slate-200 pb-2">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ocean-700">
                    {g.label}
                  </span>
                  <span className="text-xs text-slate-400">{g.photos.length}</span>
                </h2>
                <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {g.photos.map(PhotoTile)}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.photos.map(PhotoTile)}
          </div>
        )}

        {/* Rich-media showcase: video, 360° tours, floor plans (renders nothing
            when the listing has no published deliverables). */}
        <div id="gallery-media" className="scroll-mt-24"><MediaRoom items={data.deliverables ?? []} /></div>
        <MarketingLinks token={token} locked={locked} demo={demo} />
        <section id="gallery-order" className="mt-10 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Order #{data.order.order_number}</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">Status</dt><dd className="mt-1 capitalize">{data.order.status?.replaceAll('_', ' ') || 'Gallery ready'}</dd></div>
            <div><dt className="text-slate-500">Order total</dt><dd className="mt-1">{demo ? 'Sample order' : money(price)}</dd></div>
            <div><dt className="text-slate-500">Payment</dt><dd className="mt-1">{demo ? 'Preview only' : locked ? 'Payment required' : data.paywall?.paid ? 'Paid' : 'No payment required'}</dd></div>
          </dl>
          {data.order.scheduled_at && <p className="mt-4 text-sm text-slate-600">Shoot: {new Date(data.order.scheduled_at).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} Eastern</p>}
          <div className="mt-5 flex flex-wrap gap-3">{locked && <UnlockButton />}<Link href="/portal" className="btn-secondary">Your client portal</Link><Link href="/book" className="btn-secondary">Book another shoot</Link></div>
        </section>
        {data.photos.length > 0 && <RevisionRequests token={token} photos={data.photos} selectedPhoto={revisionPhoto} demo={demo} />}
      </main>

      <footer className="mx-auto max-w-6xl px-5 pb-10 pt-4 text-center sm:px-8"><p className="font-semibold text-ocean-950">Made with care. Ready to make an impression.</p><p className="mt-2 text-sm text-slate-500">Questions about your media? <a className="text-ocean-700 underline" href="mailto:info@oceanoblue.net">We’re here to help.</a></p><p className="mt-5 text-[11px] uppercase tracking-widest text-slate-400">Oceano Blue Media</p></footer>
      {lightbox && (() => {
        const order = orderedPhotos();
        const idx = order.findIndex((p) => p.id === lightbox.id);
        const many = order.length > 1;
        return (
          <div
            role="dialog" aria-modal="true" aria-label="Photo viewer"
            className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm animate-fade-in"
            onClick={() => setLightbox(null)}
          >
            <div
              className="flex items-center justify-between px-4 py-3 text-white/90"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="font-mono text-xs tracking-wider">
                {idx >= 0 ? `${idx + 1} / ${order.length}` : ''}
                {lightbox.room_type && (
                  <span className="ml-3 text-white/50">{roomLabel(lightbox.room_type)}</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <a href="#gallery-requests" onClick={() => { setRevisionPhoto(lightbox.id); setLightbox(null); }} className="rounded-md border border-white/30 px-3 py-2 text-sm text-white hover:bg-white/10">Request changes</a>
                {locked ? (
                  <UnlockButton />
                ) : (
                  <a href={demo ? undefined : lightbox.url!} aria-disabled={demo} download={lightbox.filename} className="btn-primary">
                    <Download className="h-4 w-4" /> Save
                  </a>
                )}
                <button
                  onClick={() => setLightbox(null)}
                  className="rounded-md p-2 text-white hover:bg-white/10"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="relative grid min-h-0 flex-1 place-items-center px-4 pb-4">
              {many && (
                <button
                  onClick={(e) => { e.stopPropagation(); step(-1); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:left-4"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.url!}
                alt={lightbox.filename}
                onClick={(e) => e.stopPropagation()}
                draggable={!locked}
                onContextMenu={locked ? (e) => e.preventDefault() : undefined}
                className="max-h-full max-w-full object-contain animate-scale-in rounded-md"
              />
              {many && (
                <button
                  onClick={(e) => { e.stopPropagation(); step(1); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:right-4"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
