import Image from 'next/image';
import { ArrowDown, ArrowUpRight, Play } from 'lucide-react';
import { IMAGES, VIDEOS } from '@/lib/images';
import { SITE } from '@/lib/content';

export function Hero() {
  return (
    <section id="top" className="relative min-h-[100svh] w-full overflow-hidden bg-ink text-paper">
      {/* Living backdrop */}
      <div className="absolute inset-0 scale-[1.06]">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={IMAGES.heroStill}
        >
          <source src={VIDEOS.hero} type="video/mp4" />
        </video>
        <Image
          src={IMAGES.heroStill}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-0"
          aria-hidden
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/30" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/70 via-transparent to-transparent" />
      <div className="grain-overlay absolute inset-0 overflow-hidden" />

      {/* Top meta row */}
      <div className="container-edge relative z-10 flex items-center justify-between pt-28 sm:pt-32">
        <span className="kicker hero-fade text-paper/70">{SITE.region}</span>
        <span className="kicker hero-fade hidden text-paper/70 sm:block">Est. 2023 — Bluffton, SC</span>
      </div>

      {/* Headline anchored to bottom */}
      <div className="container-edge relative z-10 flex min-h-[calc(100svh-7rem)] flex-col justify-end pb-14">
        <h1 className="font-display font-light leading-[0.86] tracking-tight text-mega">
          <span className="hero-line">
            <span className="hero-line__inner" style={{ transitionDelay: '60ms' }}>
              Cinematic
            </span>
          </span>
          <span className="hero-line">
            <span className="hero-line__inner" style={{ transitionDelay: '160ms' }}>
              stories for
            </span>
          </span>
          <span className="hero-line">
            <span className="hero-line__inner" style={{ transitionDelay: '260ms' }}>
              <em className="italic text-ocean-soft">bold</em> brands.
            </span>
          </span>
        </h1>

        <div
          className="hero-fade mt-10 flex flex-col gap-8 border-t border-paper/20 pt-8 lg:flex-row lg:items-end lg:justify-between"
          style={{ transitionDelay: '520ms' }}
        >
          <p className="max-w-md font-grotesk text-base leading-relaxed text-paper/80 sm:text-lg">
            A hands-on video &amp; photography studio in Old Town Bluffton. We
            turn what makes you different into film, stills, and stories worth
            watching.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#work" data-cursor data-magnetic className="btn-solid bg-paper text-ink hover:bg-ocean hover:text-white">
              See the work
            </a>
            <a href="#reel" data-cursor data-magnetic className="btn-outline border-paper/40 text-paper hover:bg-paper hover:text-ink">
              <Play className="h-4 w-4 fill-current" /> Watch reel
            </a>
            <a href="#contact" data-cursor data-magnetic className="btn-outline border-paper/40 text-paper hover:bg-paper hover:text-ink">
              Start a project <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 text-paper/60 lg:flex">
        <span className="font-mono text-[0.6rem] uppercase tracking-kicker">Scroll</span>
        <ArrowDown className="h-4 w-4 animate-bounce" />
      </div>
    </section>
  );
}
