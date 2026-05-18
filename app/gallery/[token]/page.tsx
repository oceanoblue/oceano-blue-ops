'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Image as ImageIcon } from 'lucide-react';

interface GalleryPhoto {
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-ocean-700">Oceano Blue</div>
            <h1 className="text-xl font-semibold text-ocean-950">
              {data.listing ? `${data.listing.address_line1}, ${data.listing.city}` : `Order #${data.order.order_number}`}
            </h1>
          </div>
          <a
            href={`/api/delivery/${params.token}/download`}
            className="btn-primary"
            download
          >
            <Download className="h-4 w-4" /> Download all ({data.photos.length})
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {data.photos.length === 0 ? (
          <div className="card p-12 text-center text-slate-500">
            <ImageIcon className="mx-auto h-8 w-8 opacity-40" />
            <p className="mt-2">No photos delivered yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.photos.map((p) => (
              <button
                key={p.id}
                onClick={() => setLightbox(p)}
                className="relative aspect-[3/2] overflow-hidden rounded-md ring-1 ring-slate-200 hover:ring-ocean-400"
              >
                {p.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={p.filename} className="h-full w-full object-cover" loading="lazy" />
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 grid place-items-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-6xl max-h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.url!} alt={lightbox.filename} className="max-w-full max-h-[90vh] object-contain" />
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
