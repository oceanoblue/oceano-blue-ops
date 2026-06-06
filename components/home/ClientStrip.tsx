import { Star } from 'lucide-react';
import { CLIENT_LOGOS } from '@/lib/content';

export function ClientStrip() {
  const loop = [...CLIENT_LOGOS, ...CLIENT_LOGOS];
  return (
    <section className="border-b border-ink/15 bg-paper py-12 sm:py-16">
      <div className="container-edge mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="kicker text-ocean">Partners</span>
          <p className="mt-3 max-w-2xl font-display text-xl font-light leading-snug tracking-tight sm:text-2xl">
            We collaborate with forward-thinking brands to build lasting creative
            impact.
          </p>
        </div>
        <div className="shrink-0">
          <div className="flex items-center gap-1.5 text-ocean">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-current" />
            ))}
          </div>
          <p className="mt-2 font-mono text-[0.65rem] uppercase tracking-kicker opacity-60">
            Five-star rated by the brands we serve
          </p>
        </div>
      </div>

      <div className="group relative flex overflow-hidden">
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-paper to-transparent sm:w-32" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-paper to-transparent sm:w-32" />
        <div className="flex shrink-0 animate-marquee items-center group-hover:[animation-play-state:paused]">
          {loop.map((logo, i) => (
            <div key={i} className="flex shrink-0 items-center justify-center px-8 sm:px-12">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo.src}
                alt={logo.name}
                loading="lazy"
                className="h-8 w-auto max-w-[160px] object-contain opacity-60 grayscale transition-all duration-500 ease-editorial hover:opacity-100 hover:grayscale-0 sm:h-10"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
