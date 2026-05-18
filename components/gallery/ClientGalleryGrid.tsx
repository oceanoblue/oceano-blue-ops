'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';

interface Photo {
  id: string;
  filename: string;
  url: string | null;
  width: number | null;
  height: number | null;
}

export function ClientGalleryGrid({ photos }: { photos: Photo[] }) {
  const [lightbox, setLightbox] = useState<Photo | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => (
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
    </>
  );
}
