'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const TEXT =
  'We help organizations communicate clearly through video and visual storytelling — work that is strategic, unforgettable, and timeless.';

export function ScrollManifesto() {
  const section = useRef<HTMLElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    if (reduce || !desktop) return;
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled || !section.current) return;

    const ctx = gsap.context(() => {
      const words = gsap.utils.toArray<HTMLElement>('.manifesto-word');
      gsap.set(words, { opacity: 0.16 });
      gsap.to(words, {
        opacity: 1,
        ease: 'none',
        stagger: 1,
        scrollTrigger: {
          trigger: section.current,
          start: 'top top',
          end: '+=140%',
          scrub: 0.6,
          pin: true,
          anticipatePin: 1,
        },
      });
    }, section);

    return () => ctx.revert();
  }, [enabled]);

  return (
    <section ref={section} className="relative overflow-hidden bg-paper py-20 sm:py-28 md:py-32">
      <div className="container-edge">
        <span className="kicker mb-8 block text-ocean">Why Oceano Blue</span>
        {enabled ? (
          <p className="max-w-5xl font-display text-5xl font-light leading-[1.12] tracking-tight md:text-6xl">
            {TEXT.split(' ').map((w, i) => (
              <span key={i} className="manifesto-word">
                {w}{' '}
              </span>
            ))}
          </p>
        ) : (
          <p className="max-w-3xl break-words font-display text-[1.7rem] font-light leading-[1.18] tracking-tight">
            {TEXT}
          </p>
        )}
      </div>
    </section>
  );
}
