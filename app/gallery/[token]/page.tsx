'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Image as ImageIcon, ChevronDown, LayoutGrid, Rows3 } from 'lucide-react';
import { groupByRoom } from '@/lib/photos/rooms';

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
    return <div className="min-h-screen grid place-items-center text-slate-500">Loading…</div>;
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

      {lightbox && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-6xl max-h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.url!} alt={lightbox.filename} className="max-w-full max-h-[90vh] object-contain animate-scale-in rounded-md" />
            <a
              href={lightbox.url!}
              download={lightbox.filename}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-3 right-3 btn-primary"
            >
              <Download className="h-4 w-4" /> Save
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
