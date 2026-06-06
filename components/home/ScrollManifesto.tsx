'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const TEXT =
  'We are a cinematic studio in the Lowcountry — turning brands into films, frames, and stories people actually remember.';

export function ScrollManifesto() {
  const section = useRef<HTMLElement>(null);
  const inner = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const desktop = window.matchMedia('(min-width: 768px)').matches;
    if (reduce || !desktop || !section.current || !inner.current) return;

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
  }, []);

  return (
    <section ref={section} className="relative bg-paper py-24 sm:py-32">
      <div className="container-edge">
        <span className="kicker mb-8 block text-ocean">Why Oceano Blue</span>
        <p
          ref={inner}
          className="max-w-5xl font-display text-[2rem] font-light leading-[1.12] tracking-tight sm:text-5xl md:text-6xl"
        >
          {TEXT.split(' ').map((w, i) => (
            <span key={i} className="manifesto-word">
              {w}
              {i < TEXT.split(' ').length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
