'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { FAQS, SITE } from '@/lib/content';

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-paper py-20 sm:py-28">
      <div className="container-edge">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div data-reveal>
            <span className="kicker text-ocean">FAQ</span>
            <h2 className="mt-4 font-display font-light leading-[0.95] tracking-tight text-huge">
              Answered
              <br />
              <em className="italic">questions.</em>
            </h2>
            <p className="mt-6 max-w-xs font-grotesk text-sm leading-relaxed opacity-65">
              Something we didn&apos;t cover?{' '}
              <a href={SITE.emailHref} className="link-underline text-ocean">
                Email us
              </a>{' '}
              — we&apos;re quick to reply.
            </p>
          </div>

          <div className="border-t border-ink/15" data-reveal data-reveal-delay={120}>
            {FAQS.map((item, i) => {
              const isOpen = open === i;
              return (
                <div key={i} className="border-b border-ink/15">
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    data-cursor
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-5 py-6 text-left"
                  >
                    <span className="font-mono text-xs opacity-40">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1 font-display text-xl font-light leading-snug tracking-tight sm:text-2xl">
                      {item.q}
                    </span>
                    <Plus
                      className={`h-5 w-5 shrink-0 text-ocean transition-transform duration-500 ease-editorial ${
                        isOpen ? 'rotate-45' : ''
                      }`}
                    />
                  </button>
                  <div
                    className={`grid transition-all duration-500 ease-editorial ${
                      isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="max-w-2xl pb-7 pl-10 font-grotesk text-base leading-relaxed opacity-70">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
