'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Play, X } from 'lucide-react';
import { PROJECTS } from '@/lib/projects';

const vimeoId = (url: string) => url.split('/').filter(Boolean).pop();

const NOTES: Record<string, string> = {
  'mike-hostilo-law-firm-studio-commercial':
    'Recurring broadcast & social commercials shot in-studio for the Lowcountry’s most recognized personal-injury firm.',
  'newport-hospitality-group-leadership-retreat':
    'A leadership-retreat film capturing the people and culture behind a Southeast hospitality group.',
  'historic-mitchelville-freedom-park-event-coverage':
    'Event film documenting celebrations at the first self-governed town of formerly enslaved people in America.',
  'barefoot-technologies-conference-corporate-video':
    'Annual conference recap — speaker sessions, partner panels, and venue energy for a vacation-rental software leader.',
};

export function Films() {
  const films = PROJECTS.filter((p) => p.video);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <section className="bg-ink py-20 text-paper sm:py-28">
      <div className="container-edge">
        <div data-reveal>
          <span className="kicker text-ocean-soft">Films</span>
          <h2 className="mt-4 font-display font-light leading-[0.9] tracking-tight text-giant">
            Press <em className="italic">play.</em>
          </h2>
          <p className="mt-5 max-w-md font-grotesk text-sm leading-relaxed text-paper/70">
            A selection of brand films and event coverage produced for clients across the Lowcountry.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {films.map((p) => (
            <button
              key={p.slug}
              onClick={() => setOpen(vimeoId(p.video!) || null)}
              data-cursor
              data-cursor-label="Play"
              className="group relative block aspect-video w-full overflow-hidden rounded-sm bg-bone text-left"
              data-reveal
            >
              <Image
                src={p.cover}
                alt={p.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover transition-transform duration-[1.2s] ease-editorial group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
              <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-paper/50 backdrop-blur-sm transition-all duration-500 ease-editorial group-hover:scale-110 group-hover:bg-ocean">
                <Play className="h-6 w-6 translate-x-0.5 fill-paper" />
              </span>
              <div className="absolute inset-x-0 bottom-0 p-6">
                <div className="font-mono text-[0.65rem] uppercase tracking-kicker text-paper/75">{p.category}</div>
                <div className="mt-1 font-display text-2xl font-light leading-none tracking-tight sm:text-3xl">
                  {p.name}
                </div>
                <p className="mt-2 max-w-md font-grotesk text-sm leading-relaxed text-paper/70">
                  {NOTES[p.slug]}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/95 p-4 backdrop-blur-sm"
          onClick={() => setOpen(null)}
        >
          <button
            className="absolute right-5 top-5 grid h-12 w-12 place-items-center rounded-full border border-paper/30 text-paper transition-colors hover:bg-paper hover:text-ink"
            onClick={() => setOpen(null)}
            aria-label="Close"
            data-cursor
          >
            <X className="h-6 w-6" />
          </button>
          <div className="aspect-video w-full max-w-5xl overflow-hidden rounded-sm bg-black shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={`https://player.vimeo.com/video/${open}?autoplay=1&title=0&byline=0&portrait=0&dnt=1`}
              title="Oceano Blue Media film"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        </div>
      )}
    </section>
  );
}
