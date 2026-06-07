'use client';

import { useEffect, useRef, useState } from 'react';

const CAPS = [
  { n: '01', t: 'The room', s: 'A white-cyc studio in Old Town Bluffton.' },
  { n: '02', t: 'The gear', s: 'Cinema cameras, real lighting, ready to roll.' },
  { n: '03', t: 'The craft', s: 'Your story — directed, lit, and in frame.' },
];

export function ScrollScrubStudio() {
  const wrap = useRef<HTMLElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [cap, setCap] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const w = wrap.current;
    const v = video.current;
    if (!w || reduce) return;

    // Prime the decoder (esp. iOS) so currentTime scrubbing is responsive on touch.
    v?.play().then(() => v?.pause()).catch(() => {});

    let raf = 0;
    let running = false;
    const tick = () => {
      const rect = w.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = total > 0 ? Math.min(Math.max(-rect.top / total, 0), 1) : 0;
      if (v && v.duration && isFinite(v.duration)) v.currentTime = p * v.duration;
      if (media.current) media.current.style.transform = `scale(${(1.08 - 0.08 * p).toFixed(4)})`;
      setCap(p < 0.4 ? 0 : p < 0.7 ? 1 : 2);
      if (running) raf = requestAnimationFrame(tick);
    };

    // Only run the scrub loop while the section is on/near screen.
    const io = new IntersectionObserver(
      (entries) => {
        const onScreen = entries[0].isIntersecting;
        if (onScreen && !running) {
          running = true;
          raf = requestAnimationFrame(tick);
        } else if (!onScreen && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { rootMargin: '200px 0px' }
    );
    io.observe(w);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  return (
    // Tall scroll track. The visual sticks (native CSS) for the duration — no
    // GSAP pin / spacer, so it can't leave white gaps or a duplicated still.
    <section ref={wrap} className="relative h-[280vh]">
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden bg-ink text-paper">
        {/* Full-bleed high-quality studio footage */}
        <div ref={media} className="absolute inset-0 will-change-transform">
          <video
            ref={video}
            src="/studio/studio-hq.mp4"
            poster="/studio/studio-hq-poster.jpg"
            muted
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
            {CAPS.map((c, i) => (
              <div
                key={c.n}
                className="absolute inset-0 flex flex-col justify-end transition-all duration-500 ease-editorial"
                style={{ opacity: cap === i ? 1 : 0, transform: `translateY(${cap === i ? 0 : 16}px)` }}
              >
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
      </div>
    </section>
  );
}
