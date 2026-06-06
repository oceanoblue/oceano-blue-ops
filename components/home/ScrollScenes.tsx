'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { IMAGES } from '@/lib/images';

gsap.registerPlugin(ScrollTrigger);

const SCENES = [
  { no: '01', tag: 'Motion', title: 'Film', copy: 'Brand films, commercials & social — shot and cut with cinematic intent.', image: IMAGES.hero },
  { no: '02', tag: 'Stills', title: 'Photography', copy: 'Brand, product & portrait work with one ownable, consistent look.', image: IMAGES.brandStill },
  { no: '03', tag: 'Space', title: 'The Studio', copy: 'A white-cyc studio in Old Town Bluffton, built for all of it.', image: IMAGES.studio },
];

export function ScrollScenes() {
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
      const scenes = gsap.utils.toArray<HTMLElement>('.scene');
      const caps = gsap.utils.toArray<HTMLElement>('.scene-cap');
      const dots = gsap.utils.toArray<HTMLElement>('.scene-dot');

      gsap.set(scenes, { autoAlpha: 0, scale: 1.08 });
      gsap.set(scenes[0], { autoAlpha: 1, scale: 1 });
      gsap.set(caps, { autoAlpha: 0, y: 24 });
      gsap.set(caps[0], { autoAlpha: 1, y: 0 });
      gsap.set(dots[0], { backgroundColor: '#1452f0', scale: 1.0 });

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.5,
        },
      });

      for (let i = 1; i < scenes.length; i++) {
        const seg = `seg${i}`;
        tl.addLabel(seg)
          .to(scenes[i - 1], { autoAlpha: 0, scale: 1.08, duration: 1 }, seg)
          .fromTo(scenes[i], { scale: 1.08 }, { autoAlpha: 1, scale: 1, duration: 1 }, seg)
          .to(caps[i - 1], { autoAlpha: 0, y: -24, duration: 0.5 }, seg)
          .fromTo(caps[i], { y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5 }, seg + '+=0.5')
          .to(dots[i - 1], { backgroundColor: 'rgba(243,239,230,0.35)', duration: 0.5 }, seg)
          .to(dots[i], { backgroundColor: '#1452f0', duration: 0.5 }, seg)
          .to({}, { duration: 0.6 }); // dwell on each scene
      }
    }, section);

    return () => ctx.revert();
  }, [enabled]);

  return (
    <section
      ref={section}
      className={`relative bg-ink text-paper ${enabled ? 'h-[340vh]' : ''}`}
      aria-label="What we do"
    >
      <div className={enabled ? 'sticky top-0 h-[100svh] overflow-hidden' : ''}>
        {/* Scenes */}
        <div className={enabled ? 'absolute inset-0' : ''}>
          {SCENES.map((s, i) => (
            <div
              key={s.no}
              className={`scene ${enabled ? 'absolute inset-0' : 'relative h-[70svh]'}`}
            >
              <Image
                src={s.image}
                alt={s.title}
                fill
                sizes="100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/30" />
              {!enabled && <SceneCaption s={s} />}
            </div>
          ))}
        </div>

        {/* Pinned captions (desktop) */}
        {enabled && (
          <div className="pointer-events-none relative z-10 flex h-full items-end">
            <div className="container-edge w-full pb-16">
              <div className="grid">
                {SCENES.map((s) => (
                  <div key={s.no} className="scene-cap col-start-1 row-start-1">
                    <SceneCaption s={s} />
                  </div>
                ))}
              </div>
            </div>
            {/* progress dots */}
            <div className="absolute right-6 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
              {SCENES.map((s) => (
                <span key={s.no} className="scene-dot h-2.5 w-2.5 rounded-full bg-paper/35" />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SceneCaption({ s }: { s: (typeof SCENES)[number] }) {
  return (
    <div className="max-w-2xl px-1">
      <div className="flex items-center gap-3 font-mono text-[0.7rem] uppercase tracking-kicker text-paper/70">
        <span>{s.no}</span>
        <span className="h-px w-8 bg-paper/40" />
        <span>{s.tag}</span>
      </div>
      <h3 className="mt-4 font-display font-light leading-[0.9] tracking-tight text-giant">{s.title}</h3>
      <p className="mt-4 max-w-md font-grotesk text-base leading-relaxed text-paper/80">{s.copy}</p>
    </div>
  );
}
