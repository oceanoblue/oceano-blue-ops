import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { SiteShell } from '@/components/site/SiteShell';
import { PageHero } from '@/components/site/PageHero';
import { Films } from '@/components/work/Films';
import { PROJECTS } from '@/lib/projects';

export const metadata: Metadata = {
  title: 'Work',
  description:
    'Selected commercial video, photography, and media projects from Oceano Blue Media — produced for businesses, institutions, and brands across the Lowcountry.',
};

export default function WorkPage() {
  return (
    <SiteShell>
      <PageHero
        kicker="Selected Work"
        title={<>Work that earns <em className="italic">attention.</em></>}
        intro="A selection of commercial video, photography, and media projects produced for businesses, organizations, and institutions across the Lowcountry and beyond."
      />

      <section className="bg-paper py-16 sm:py-24">
        <div className="container-edge grid gap-5 md:grid-cols-2">
          {PROJECTS.map((p, i) => (
            <Link
              key={p.slug}
              href={`/work/${p.slug}`}
              data-cursor
              data-cursor-label="View"
              className={`group relative block overflow-hidden rounded-sm bg-bone ${
                i % 3 === 0 ? 'md:col-span-2 aspect-[16/9]' : 'aspect-[4/3]'
              }`}
              data-reveal
            >
              <Image
                src={p.cover}
                alt={p.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover transition-transform duration-[1.2s] ease-editorial group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/10 to-transparent opacity-85 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 text-paper sm:p-8">
                <div className="translate-y-1 transition-transform duration-500 ease-editorial group-hover:translate-y-0">
                  <div className="font-mono text-[0.65rem] uppercase tracking-kicker text-paper/75">
                    {p.category}
                  </div>
                  <div className="mt-2 font-display text-3xl font-light leading-none tracking-tight sm:text-4xl">
                    {p.name}
                  </div>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-paper/15 backdrop-blur-sm transition-all duration-500 ease-editorial group-hover:bg-ocean">
                  <ArrowUpRight className="h-5 w-5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Films />
    </SiteShell>
  );
}
