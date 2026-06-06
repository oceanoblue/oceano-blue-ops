'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { WORK } from '@/lib/content';

function Tile({
  item,
  className = '',
  aspect = 'aspect-[4/3]',
}: {
  item: (typeof WORK)[number];
  className?: string;
  aspect?: string;
}) {
  const vid = useRef<HTMLVideoElement>(null);

  const onEnter = () => {
    const v = vid.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  };
  const onLeave = () => {
    const v = vid.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
  };

  return (
    <a
      href="#contact"
      data-cursor
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={`group relative block overflow-hidden rounded-sm bg-bone ${aspect} ${className}`}
      data-reveal
    >
      <div className="absolute -inset-[12%]" data-parallax="0.05">
        <Image
          src={item.image}
          alt={item.title}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover transition-transform duration-[1.2s] ease-editorial group-hover:scale-105"
        />
        {item.video && (
          <video
            ref={vid}
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100"
            muted
            loop
            playsInline
            preload="none"
            poster={item.image}
          >
            <source src={item.video} type="video/mp4" />
          </video>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/5 to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-paper sm:p-6">
        <div className="translate-y-1 transition-transform duration-500 ease-editorial group-hover:translate-y-0">
          <div className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-kicker text-paper/75">
            {item.video && (
              <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-coral" />
            )}
            {item.category}
          </div>
          <div className="mt-1 font-display text-2xl font-light leading-none tracking-tight sm:text-3xl">
            {item.title}
          </div>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper/15 backdrop-blur-sm transition-all duration-500 ease-editorial group-hover:bg-ocean">
          <ArrowUpRight className="h-5 w-5" />
        </span>
      </div>
    </a>
  );
}

export function FeaturedWork() {
  return (
    <section id="work" className="bg-ink py-20 text-paper sm:py-28">
      <div className="container-edge">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-reveal>
          <div>
            <span className="kicker text-ocean-soft">Selected work</span>
            <h2 className="mt-4 font-display font-light leading-[0.9] tracking-tight text-giant">
              Frames we&apos;re
              <br />
              <em className="italic">proud</em> of.
            </h2>
          </div>
          <a
            href="#contact"
            data-cursor
            className="btn-outline border-paper/40 text-paper hover:bg-paper hover:text-ink"
          >
            Start your project <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-14 space-y-4 sm:space-y-5">
          {/* Row 1 */}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-12">
            <Tile item={WORK[0]} className="md:col-span-8" aspect="aspect-[16/10]" />
            <Tile item={WORK[1]} className="md:col-span-4 md:aspect-auto md:h-full" aspect="aspect-[4/5]" />
          </div>
          {/* Row 2 */}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-12">
            <Tile item={WORK[2]} className="md:col-span-4 md:aspect-auto md:h-full" aspect="aspect-[4/5]" />
            <Tile item={WORK[3]} className="md:col-span-8" aspect="aspect-[16/10]" />
          </div>
          {/* Row 3 */}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
            <Tile item={WORK[4]} aspect="aspect-[4/3]" />
            <Tile item={WORK[5]} aspect="aspect-[4/3]" />
          </div>
        </div>
      </div>
    </section>
  );
}
