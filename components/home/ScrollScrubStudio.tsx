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
  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    if (reduce || !desktop) return;
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled || !section.current || !video.current) return;
    const v = video.current;
    v.pause();

    const ctx = gsap.context(() => {
      const caps = gsap.utils.toArray<HTMLElement>('.scrub-cap');
      gsap.set(caps, { autoAlpha: 0, y: 16 });
      gsap.set(caps[0], { autoAlpha: 1, y: 0 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section.current,
          start: 'top top',
          end: '+=300%',
          scrub: 0.4,
          pin: stage.current,
          anticipatePin: 1,
          onUpdate: (self) => {
            const d = v.duration;
            if (d && isFinite(d)) v.currentTime = self.progress * d;
          },
        },
      });
      tl.to(caps[0], { autoAlpha: 0, y: -16, duration: 0.4 }, 0.3)
        .fromTo(caps[1], { y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 0.34)
        .to(caps[1], { autoAlpha: 0, y: -16, duration: 0.4 }, 0.63)
        .fromTo(caps[2], { y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 0.67);
    }, section);

    return () => ctx.revert();
  }, [enabled]);

  return (
    <section ref={section} className={`relative bg-ink text-paper ${enabled ? 'h-[300vh]' : ''}`}>
      <div
        ref={stage}
        className={
          enabled
            ? 'flex min-h-[100svh] flex-col justify-center overflow-hidden py-16'
            : 'overflow-hidden py-20'
        }
      >
        <div className="grain-overlay pointer-events-none absolute inset-0 overflow-hidden" />
        <div className="container-edge relative z-10">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="kicker text-ocean-soft">Inside the studio</span>
              <h2 className="mt-3 font-display font-light leading-[0.95] tracking-tight text-huge">
                The room where it
                <br className="hidden sm:block" /> comes together.
              </h2>
            </div>
            <span className="hidden font-mono text-[0.65rem] uppercase tracking-kicker text-paper/50 sm:block">
              Scroll to explore ↓
            </span>
          </div>

          {/* 16:9 cinematic frame */}
          <div className="relative mx-auto aspect-video w-full max-w-5xl overflow-hidden rounded-sm bg-black shadow-2xl">
            <video
              ref={video}
              src="/studio/studio-scrub.mp4"
              poster="/studio/studio-poster.jpg"
              muted
              playsInline
              preload="auto"
              autoPlay={!enabled}
              loop={!enabled}
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />

            {/* Captions */}
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
              <div className="relative h-20 sm:h-24">
                {(enabled ? CAPS : CAPS.slice(0, 1)).map((c) => (
                  <div key={c.n} className="scrub-cap absolute inset-0 flex flex-col justify-end">
                    <span className="font-mono text-[0.65rem] uppercase tracking-kicker text-ocean-soft">
                      {c.n} — {c.t}
                    </span>
                    <p className="mt-2 max-w-md font-display text-xl font-light leading-snug tracking-tight sm:text-2xl">
                      {c.s}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
          </div>
        </div>
      </div>
    </section>
  );
}
