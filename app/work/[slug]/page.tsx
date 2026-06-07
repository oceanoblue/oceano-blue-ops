import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Play } from 'lucide-react';
import { SiteShell } from '@/components/site/SiteShell';
import { PROJECTS, getProject } from '@/lib/projects';

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const p = getProject(params.slug);
  if (!p) return { title: 'Work' };
  return { title: p.name, description: p.introText.slice(0, 155) };
}

export default function CaseStudy({ params }: { params: { slug: string } }) {
  const p = getProject(params.slug);
  if (!p) notFound();

  const idx = PROJECTS.findIndex((x) => x.slug === p.slug);
  const next = PROJECTS[(idx + 1) % PROJECTS.length];

  return (
    <SiteShell>
      {/* Cover hero */}
      <section className="relative h-[88svh] min-h-[520px] w-full overflow-hidden bg-ink text-paper">
        <Image src={p.cover} alt={p.name} fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/50" />
        <div className="grain-overlay pointer-events-none absolute inset-0 overflow-hidden" />
        <div className="container-edge relative z-10 flex h-full flex-col justify-between pb-14 pt-32">
          <Link href="/work" data-cursor className="inline-flex w-fit items-center gap-2 font-mono text-[0.65rem] uppercase tracking-kicker text-paper/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> All work
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="font-mono text-[0.7rem] uppercase tracking-kicker text-paper/80">{p.category}</span>
            </div>
            <h1 className="mt-5 max-w-[18ch] font-display font-light leading-[0.9] tracking-tight text-giant">
              {p.name}
            </h1>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="bg-paper py-20 sm:py-28">
        <div className="container-edge grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <h2 className="font-display font-light leading-[0.98] tracking-tight text-huge" data-reveal>
            {p.introTitle}
          </h2>
          <div data-reveal data-reveal-delay={120}>
            <p className="max-w-xl font-grotesk text-base leading-relaxed opacity-75 sm:text-lg">{p.introText}</p>
            {p.video && (
              <a
                href={p.video}
                target="_blank"
                rel="noreferrer"
                data-magnetic
                className="btn-blue mt-8 text-xs"
              >
                <Play className="h-4 w-4 fill-current" /> Watch the film
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="bg-paper pb-4">
        <div className="container-edge grid gap-4 sm:gap-5 md:grid-cols-2">
          {p.images.map((src, i) => (
            <div
              key={i}
              className={`relative overflow-hidden rounded-sm bg-bone ${
                i === 0 ? 'md:col-span-2 aspect-[16/9]' : 'aspect-[4/3]'
              }`}
              data-reveal
            >
              <Image src={src} alt={`${p.name} ${i + 1}`} fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover" />
            </div>
          ))}
        </div>
      </section>

      {/* Midpage full-bleed */}
      <section className="bg-paper py-4">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-bone" data-reveal>
          <Image src={p.midImage} alt={p.name} fill sizes="100vw" className="object-cover" />
        </div>
      </section>

      {/* Final */}
      <section className="bg-paper py-20 sm:py-28">
        <div className="container-edge grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-bone" data-reveal>
            <Image src={p.finalImage} alt={p.finalTitle} fill sizes="(max-width:1024px) 100vw, 50vw" className="object-cover" />
          </div>
          <div data-reveal data-reveal-delay={120}>
            <h2 className="font-display font-light leading-[0.98] tracking-tight text-huge">{p.finalTitle}</h2>
            <p className="mt-6 max-w-xl font-grotesk text-base leading-relaxed opacity-75">{p.finalText}</p>
          </div>
        </div>
      </section>

      {/* Next project */}
      <Link
        href={`/work/${next.slug}`}
        data-cursor
        data-cursor-label="Next"
        className="group relative block h-[50svh] min-h-[360px] w-full overflow-hidden bg-ink text-paper"
      >
        <Image src={next.cover} alt={next.name} fill sizes="100vw" className="object-cover opacity-50 transition-all duration-[1.2s] ease-editorial group-hover:scale-105 group-hover:opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-ink/30" />
        <div className="container-edge relative z-10 flex h-full flex-col items-center justify-center text-center">
          <span className="font-mono text-[0.65rem] uppercase tracking-kicker text-paper/70">Next project</span>
          <span className="mt-3 font-display font-light leading-[0.95] tracking-tight text-giant">{next.name}</span>
          <span className="mt-5 inline-flex items-center gap-2 font-grotesk text-sm uppercase tracking-wide">
            View case <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </Link>
    </SiteShell>
  );
}
