'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Image as ImageIcon, ChevronDown, LayoutGrid, Rows3, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { groupByRoom, roomLabel } from '@/lib/photos/rooms';

type DeliverySize = 'full' | 'print' | 'web';

const SIZE_OPTIONS: { value: DeliverySize; label: string; hint: string }[] = [
  { value: 'full', label: 'Full resolution', hint: 'Original 4K finals — archival & large print' },
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

interface GalleryData {
  order: { id: string; order_number: number };
  listing: { address_line1: string; city: string; state: string; zip: string } | null;
  photos: GalleryPhoto[];
}

export default function GalleryPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<GalleryData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<GalleryPhoto | null>(null);
  const [size, setSize] = useState<DeliverySize>('full');
  const [sizeOpen, setSizeOpen] = useState(false);
  // Default to the room-organized view when the photos have been classified;
  // clients can switch to a single flat grid via the toggle. (No effect when
  // nothing is classified — hasRooms gates the grouped render below.)
  const [byRoom, setByRoom] = useState(true);

  useEffect(() => {
    fetch(`/api/delivery/${params.token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErr(d.error);
        else setData(d);
      })
      .catch((e) => setErr(String(e)));
  }, [params.token]);

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
             err === 'not_found' ? "We couldn't find this gallery." : err}
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
        <main className="mx-auto max-w-6xl px-6 py-8">
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

  const PhotoTile = (p: GalleryPhoto) => (
    <button
      key={p.id}
      onClick={() => setLightbox(p)}
      className="group relative aspect-[3/2] overflow-hidden rounded-lg ring-1 ring-slate-200 shadow-soft transition-all duration-300 ease-swift hover:-translate-y-0.5 hover:shadow-lift hover:ring-ocean-400"
    >
      {p.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.url} alt={p.filename} className="h-full w-full object-cover transition-transform duration-500 ease-swift group-hover:scale-[1.04]" loading="lazy" />
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-ocean-700">Oceano Blue</div>
            <h1 className="text-xl font-semibold text-ocean-950">
              {data.listing ? `${data.listing.address_line1}, ${data.listing.city}` : `Order #${data.order.order_number}`}
            </h1>
          </div>
          <div className="flex items-center gap-2">
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
            <a
              href={`/api/delivery/${params.token}/download${size === 'full' ? '' : `?size=${size}`}`}
              className="btn-primary"
              download
              title={SIZE_OPTIONS.find((o) => o.value === size)?.hint}
            >
              <Download className="h-4 w-4" /> Download all ({data.photos.length})
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {data.photos.length === 0 ? (
          <div className="card p-12 text-center text-slate-500">
            <ImageIcon className="mx-auto h-8 w-8 opacity-40" />
            <p className="mt-2">No photos delivered yet.</p>
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
      </main>

      {lightbox && (() => {
        const order = orderedPhotos();
        const idx = order.findIndex((p) => p.id === lightbox.id);
        const many = order.length > 1;
        return (
          <div
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
                <a href={lightbox.url!} download={lightbox.filename} className="btn-primary">
                  <Download className="h-4 w-4" /> Save
                </a>
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
