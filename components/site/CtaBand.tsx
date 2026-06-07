import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { SITE } from '@/lib/content';

export function CtaBand({
  kicker = 'Start a project',
  title,
  body,
}: {
  kicker?: string;
  title?: ReactNode;
  body?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-ink py-24 text-paper sm:py-32">
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 -translate-y-1/3 rounded-full bg-ocean/25 blur-3xl" />
      <div className="grain-overlay pointer-events-none absolute inset-0 overflow-hidden" />
      <div className="container-edge relative text-center" data-reveal>
        <span className="kicker text-ocean-soft">{kicker}</span>
        <h2 className="mx-auto mt-5 max-w-[16ch] font-display font-light leading-[0.95] tracking-tight text-giant">
          {title ?? (
            <>
              Let&apos;s make something{' '}
              <em className="italic text-ocean-soft">unforgettable.</em>
            </>
          )}
        </h2>
        <p className="mx-auto mt-6 max-w-md font-grotesk text-base leading-relaxed text-paper/70">
          {body ??
            'Tell us about your project and we’ll be in touch within one business day.'}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contact"
            data-cursor
            data-magnetic
            className="btn-solid bg-paper text-ink hover:bg-ocean hover:text-white"
          >
            Start a project <ArrowUpRight className="h-4 w-4" />
          </Link>
          <a
            href={SITE.phoneHref}
            data-cursor
            className="btn-outline border-paper/40 text-paper hover:bg-paper hover:text-ink"
          >
            {SITE.phone}
          </a>
        </div>
      </div>
    </section>
  );
}
