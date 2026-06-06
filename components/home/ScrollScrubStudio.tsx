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
      gsap.set(caps, { autoAlpha: 0, y: 24 });
      gsap.set(caps[0], { autoAlpha: 1, y: 0 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section.current,
          start: 'top top',
          end: '+=320%',
          scrub: 0.4,
          pin: stage.current,
          anticipatePin: 1,
          onUpdate: (self) => {
            const d = v.duration;
            if (d && isFinite(d)) v.currentTime = self.progress * d;
          },
        },
      });
      tl.to(caps[0], { autoAlpha: 0, y: -24, duration: 0.4 }, 0.30)
        .fromTo(caps[1], { y: 24 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 0.34)
        .to(caps[1], { autoAlpha: 0, y: -24, duration: 0.4 }, 0.63)
        .fromTo(caps[2], { y: 24 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 0.67);
    }, section);

    return () => ctx.revert();
  }, [enabled]);

  return (
    <section ref={section} className={`relative bg-ink text-paper ${enabled ? 'h-[340vh]' : ''}`}>
      <div
        ref={stage}
        className={
          enabled
            ? 'sticky top-0 flex h-[100svh] items-center overflow-hidden'
            : 'relative overflow-hidden py-20'
        }
      >
        <div className="grain-overlay pointer-events-none absolute inset-0 overflow-hidden" />
        <div className="container-edge relative z-10 grid w-full items-center gap-10 md:grid-cols-[1fr_auto_1fr]">
          {/* Left label */}
          <div className="hidden md:block">
            <span className="kicker text-ocean-soft">Inside the studio</span>
            <p className="mt-4 max-w-xs font-grotesk text-sm leading-relaxed text-paper/60">
              Scroll to step through the room where it all comes together.
            </p>
          </div>

          {/* Scrubbed video */}
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[min(78vw,clamp(240px,40vh,380px))] overflow-hidden rounded-sm bg-black shadow-2xl">
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
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
          </div>

          {/* Captions */}
          <div className="relative md:h-44">
            {CAPS.map((c, i) => (
              <div
                key={c.n}
                className="scrub-cap mt-6 md:mt-0 md:absolute md:inset-0 md:flex md:flex-col md:justify-center"
              >
                <span className="font-mono text-xs uppercase tracking-kicker text-ocean-soft">{c.n}</span>
                <h3 className="mt-3 font-display font-light leading-[0.95] tracking-tight text-huge">{c.t}</h3>
                <p className="mt-3 max-w-xs font-grotesk text-sm leading-relaxed text-paper/70">{c.s}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
