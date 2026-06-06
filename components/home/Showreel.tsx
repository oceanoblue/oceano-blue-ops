'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Play, X } from 'lucide-react';
import { IMAGES } from '@/lib/images';
import { SITE } from '@/lib/content';

const BG_SRC = `https://player.vimeo.com/video/${SITE.reelVimeoId}?background=1&autoplay=1&loop=1&muted=1&autopause=0`;
const PLAY_SRC = `https://player.vimeo.com/video/${SITE.reelVimeoId}?autoplay=1&title=0&byline=0&portrait=0&dnt=1`;

export function Showreel() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <section id="reel" className="relative h-[100svh] min-h-[520px] w-full overflow-hidden bg-ink text-paper">
      {/* Poster fallback behind the player */}
      <Image src={IMAGES.studio} alt="" fill sizes="100vw" className="object-cover" aria-hidden />

      {/* Ambient reel background (cover) */}
      <div className="absolute inset-0 overflow-hidden">
        <iframe
          src={BG_SRC}
          title="Oceano Blue showreel"
          allow="autoplay; fullscreen; picture-in-picture"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full -translate-x-1/2 -translate-y-1/2"
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/30 to-ink/50" />
      <div className="grain-overlay absolute inset-0 overflow-hidden" />

      <button
        onClick={() => setOpen(true)}
        data-cursor
        data-cursor-label="Play reel"
        className="group absolute inset-0 z-10 flex h-full w-full flex-col items-center justify-center text-center"
        aria-label="Play showreel"
      >
        <span className="kicker mb-8 text-paper/70" data-reveal>The Reel — 2026</span>
        <span className="grid h-24 w-24 place-items-center rounded-full border border-paper/40 backdrop-blur-sm transition-all duration-500 ease-editorial group-hover:scale-110 group-hover:border-paper group-hover:bg-paper/10">
          <Play className="h-8 w-8 translate-x-0.5 fill-paper" />
        </span>
        <h2 className="mt-8 max-w-[18ch] font-display font-light leading-[0.95] tracking-tight text-giant" data-reveal>
          We don&apos;t describe it.
          <br />
          We <em className="italic">show</em> it.
        </h2>
        <p className="mt-5 max-w-md font-grotesk text-sm leading-relaxed text-paper/75" data-reveal>
          Press play — a look at what we make for brands across the Lowcountry.
        </p>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/95 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <button
            className="absolute right-5 top-5 grid h-12 w-12 place-items-center rounded-full border border-paper/30 text-paper transition-colors hover:bg-paper hover:text-ink"
            onClick={() => setOpen(false)}
            aria-label="Close"
            data-cursor
          >
            <X className="h-6 w-6" />
          </button>
          <div
            className="aspect-video w-full max-w-5xl overflow-hidden rounded-sm bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={PLAY_SRC}
              title="Oceano Blue Media — Showreel"
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
