import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { NAV, SITE } from '@/lib/content';
import { SpinBadge } from '@/components/site/SpinBadge';

export function Footer() {
  return (
    <footer className="overflow-hidden bg-ink text-paper">
      <div className="container-edge py-16 sm:py-20">
        {/* Call to action band */}
        <div className="flex flex-col items-start justify-between gap-10 border-b border-paper/15 pb-14 sm:flex-row sm:items-center" data-reveal>
          <h2 className="max-w-2xl font-display font-light leading-[0.92] tracking-tight text-huge">
            Have a project
            <br />
            in mind?
          </h2>
          <SpinBadge tone="light" className="h-32 w-32 shrink-0 sm:h-40 sm:w-40" />
        </div>

        <div className="grid gap-12 pt-14 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Image src="/brand/logo-blue.png" alt="Oceano Blue Media" width={220} height={51} className="h-9 w-auto" />
            <p className="mt-6 max-w-sm font-display text-2xl font-light leading-tight text-paper/90">
              Cinematic stories, crafted by hand in the Lowcountry.
            </p>
            <a href="#contact" className="btn-blue mt-8 text-xs">
              Start a project <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>

          <div>
            <div className="kicker text-paper/50">Explore</div>
            <ul className="mt-5 space-y-3">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="link-underline text-paper/85 hover:text-white">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="kicker text-paper/50">Studio</div>
            <ul className="mt-5 space-y-3 text-paper/85">
              <li>
                <a href={SITE.phoneHref} className="link-underline hover:text-white">
                  {SITE.phone}
                </a>
              </li>
              <li>
                <a href={SITE.emailHref} className="link-underline hover:text-white">
                  {SITE.email}
                </a>
              </li>
              <li className="pt-2 text-paper/60">{SITE.location}</li>
              <li className="text-paper/60">{SITE.region}</li>
              <li className="pt-2">
                <a href={SITE.instagram} className="link-underline hover:text-white">
                  Instagram ↗
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-paper/15 pt-8 text-xs text-paper/50 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-mono uppercase tracking-widest">
            © {new Date().getFullYear()} Oceano Blue Media
          </span>
          <span className="font-mono uppercase tracking-widest">
            Video · Photography · Bluffton, SC
          </span>
        </div>
      </div>

      {/* Oversized wordmark */}
      <div aria-hidden className="select-none px-2 pb-2">
        <div className="whitespace-nowrap text-center font-display font-light leading-none tracking-tight text-paper/10 [font-size:14vw]">
          Oceano Blue
        </div>
      </div>
    </footer>
  );
}
