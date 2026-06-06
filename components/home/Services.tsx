'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { SERVICES } from '@/lib/content';

export function Services() {
  const [active, setActive] = useState(0);

  return (
    <section id="services" className="bg-paper py-20 sm:py-28">
      <div className="container-edge">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-reveal>
          <div>
            <span className="kicker text-ocean">What we do</span>
            <h2 className="mt-4 font-display font-light leading-[0.9] tracking-tight text-giant">
              Five ways
              <br />
              we make you <em className="italic">unforgettable.</em>
            </h2>
          </div>
          <p className="max-w-xs font-grotesk text-sm leading-relaxed opacity-70">
            One studio, one consistent visual language — across every camera we
            pick up.
          </p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Sticky preview (desktop) */}
          <div className="hidden lg:block">
            <div className="sticky top-28 aspect-[4/5] w-full overflow-hidden rounded-sm bg-bone">
              {SERVICES.map((s, i) => (
                <Image
                  key={s.title}
                  src={s.image}
                  alt={s.title}
                  fill
                  sizes="40vw"
                  className={`object-cover transition-all duration-700 ease-editorial ${
                    active === i ? 'scale-100 opacity-100' : 'scale-105 opacity-0'
                  }`}
                />
              ))}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/40 to-transparent" />
              <span className="absolute bottom-5 left-5 font-mono text-xs uppercase tracking-kicker text-paper">
                {SERVICES[active].no} / {String(SERVICES.length).padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* List */}
          <ul className="border-t border-ink/15">
            {SERVICES.map((s, i) => (
              <li
                key={s.title}
                onMouseEnter={() => setActive(i)}
                className="group border-b border-ink/15 py-7 transition-colors duration-300 hover:bg-ink hover:text-paper"
                data-reveal
                data-reveal-delay={i * 60}
              >
                <div className="flex items-start gap-5 px-1 sm:px-4">
                  <span className="font-mono text-xs opacity-50 group-hover:opacity-80">{s.no}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-display text-3xl font-light leading-none tracking-tight sm:text-4xl md:text-5xl">
                        {s.title}
                      </h3>
                      <ArrowUpRight className="h-6 w-6 shrink-0 -translate-x-2 opacity-0 transition-all duration-300 ease-editorial group-hover:translate-x-0 group-hover:opacity-100" />
                    </div>

                    {/* Mobile image */}
                    <div className="relative mt-5 aspect-[16/10] w-full overflow-hidden rounded-sm lg:hidden">
                      <Image src={s.image} alt={s.title} fill sizes="100vw" className="object-cover" />
                    </div>

                    <p className="mt-4 max-w-md font-grotesk text-sm leading-relaxed opacity-70 group-hover:opacity-90">
                      {s.blurb}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {s.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-ink/20 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-wide opacity-70 group-hover:border-paper/30"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
