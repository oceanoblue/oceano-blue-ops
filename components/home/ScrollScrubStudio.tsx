'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const CAPS = [
  { n: '01', t: 'The room', s: 'A white-cyc studio in Old Town Bluffton.' },
  { n: '02', t: 'The gear', s: 'Cinema cameras, real lighting, ready to roll.' },
  { n: '03', t: 'The craft', s: 'Your story — directed, lit, and in frame.' },
];

export function ScrollScrubStudio() {
  const section = useRef<HTMLElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    if (reduce || !desktop) return;
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled || !section.current) return;
    const v = video.current;
    v?.pause();

    const ctx = gsap.context(() => {
      const caps = gsap.utils.toArray<HTMLElement>('.scrub-cap');
      gsap.set(caps, { autoAlpha: 0, y: 16 });
      gsap.set(caps[0], { autoAlpha: 1, y: 0 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section.current,
          start: 'top top',
          end: '+=260%',
          scrub: 0.4,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const d = v?.duration;
            if (v && d && isFinite(d)) v.currentTime = self.progress * d;
          },
        },
      });
      // Subtle slow zoom on the footage as you move through
      if (media.current) tl.fromTo(media.current, { scale: 1.08 }, { scale: 1, ease: 'none' }, 0);
      tl.to(caps[0], { autoAlpha: 0, y: -16, duration: 0.4 }, 0.3)
        .fromTo(caps[1], { y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 0.34)
        .to(caps[1], { autoAlpha: 0, y: -16, duration: 0.4 }, 0.63)
        .fromTo(caps[2], { y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 0.67);
    }, section);

    return () => ctx.revert();
  }, [enabled]);

  return (
    <section ref={section} className="relative h-[100svh] w-full overflow-hidden bg-ink text-paper">
      {/* Full-bleed high-quality studio footage (falls back to real footage until the HQ clip is wired) */}
      <div ref={media} className="absolute inset-0">
        <video
          ref={video}
          src="/studio/studio-hq.mp4"
          poster="/studio/studio-hq-poster.jpg"
          muted
          loop={!enabled}
          autoPlay={!enabled}
          playsInline
          preload="auto"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/30 to-ink/55" />
      <div className="grain-overlay pointer-events-none absolute inset-0 overflow-hidden" />

      <div className="container-edge relative z-10 flex h-full flex-col justify-between py-20 sm:py-24">
        <div className="flex items-start justify-between gap-6">
          <div>
            <span className="kicker text-ocean-soft">Inside the studio</span>
            <h2 className="mt-4 max-w-[14ch] font-display font-light leading-[0.95] tracking-tight text-giant">
              The room where it comes together.
            </h2>
          </div>
          <span className="hidden font-mono text-[0.65rem] uppercase tracking-kicker text-paper/50 sm:block">
            Scroll to explore ↓
          </span>
        </div>

        <div className="relative h-24 max-w-md">
          {(enabled ? CAPS : CAPS.slice(0, 1)).map((c) => (
            <div key={c.n} className="scrub-cap absolute inset-0 flex flex-col justify-end">
              <span className="font-mono text-[0.65rem] uppercase tracking-kicker text-ocean-soft">
                {c.n} — {c.t}
              </span>
              <p className="mt-2 font-display text-xl font-light leading-snug tracking-tight sm:text-2xl">
                {c.s}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
