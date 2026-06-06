'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Play, X } from 'lucide-react';
import { IMAGES, VIDEOS } from '@/lib/images';

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
    <section id="reel" className="relative h-[78svh] min-h-[460px] w-full overflow-hidden bg-ink text-paper">
      {VIDEOS.showreel ? (
        <video
          className="absolute inset-0 h-full w-full scale-[1.06] object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={IMAGES.studio}
        >
          <source src={VIDEOS.showreel} type="video/mp4" />
        </video>
      ) : (
        <Image src={IMAGES.studio} alt="Inside the Oceano Blue studio" fill sizes="100vw" className="object-cover" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/25 to-ink/40" />
      <div className="grain-overlay absolute inset-0 overflow-hidden" />

      <button
        onClick={() => setOpen(true)}
        data-cursor
        className="group absolute inset-0 z-10 flex h-full w-full flex-col items-center justify-center text-center"
        aria-label="Play showreel"
      >
        <span className="grid h-20 w-20 place-items-center rounded-full border border-paper/40 backdrop-blur-sm transition-all duration-500 ease-editorial group-hover:scale-110 group-hover:border-paper group-hover:bg-paper/10">
          <Play className="h-7 w-7 translate-x-0.5 fill-paper" />
        </span>
        <h2 className="mt-8 max-w-[18ch] font-display font-light leading-[0.95] tracking-tight text-giant" data-reveal>
          We don&apos;t describe it.
          <br />
          We <em className="italic">show</em> it.
        </h2>
        <p className="mt-5 max-w-md font-grotesk text-sm leading-relaxed text-paper/75" data-reveal>
          Press play — real production value, real cameras, real craft.
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
          <div className="aspect-video w-full max-w-5xl overflow-hidden rounded-sm bg-black shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <video className="h-full w-full" src={VIDEOS.showreel} autoPlay controls loop playsInline />
          </div>
        </div>
      )}
    </section>
  );
}
