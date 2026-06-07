import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { SERVICES } from '@/lib/content';

export function ServiceDeepDive() {
  return (
    <section className="bg-paper">
      {SERVICES.map((s, i) => (
        <div
          key={s.title}
          className="border-t border-ink/10 py-16 first:border-t-0 sm:py-24"
        >
          <div className="container-edge grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div
              className={`relative aspect-[4/3] overflow-hidden rounded-sm bg-bone ${
                i % 2 === 1 ? 'lg:order-2' : ''
              }`}
              data-reveal
            >
              <Image
                src={s.image}
                alt={s.title}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover transition-transform duration-[1.2s] ease-editorial hover:scale-105"
              />
            </div>

            <div data-reveal data-reveal-delay={100}>
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-sm text-ocean">{s.no}</span>
                <span className="font-mono text-[0.65rem] uppercase tracking-kicker opacity-45">
                  Service
                </span>
              </div>
              <h2 className="mt-4 font-display font-light leading-[0.95] tracking-tight text-huge">
                {s.title}
              </h2>
              <p className="mt-6 max-w-xl font-grotesk text-base leading-relaxed opacity-75">
                {s.blurb}
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {s.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-ink/20 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-wide opacity-70"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <Link
                href="/contact"
                data-cursor
                className="mt-9 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-kicker text-ocean transition-colors hover:text-ink"
              >
                Start a {s.title.toLowerCase()} project
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
