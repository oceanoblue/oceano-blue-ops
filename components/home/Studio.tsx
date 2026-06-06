import Image from 'next/image';
import { IMAGES } from '@/lib/images';
import { SITE } from '@/lib/content';

export function Studio() {
  return (
    <section id="studio" className="bg-paper py-20 sm:py-28">
      <div className="container-edge">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Real studio footage */}
          <div className="relative" data-reveal>
            <div className="relative mx-auto aspect-[9/16] w-full max-w-[420px] overflow-hidden rounded-sm bg-ink shadow-2xl">
              <video
                className="h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                poster="/studio/studio-poster.jpg"
              >
                <source src="/studio/studio-loop.mp4" type="video/mp4" />
              </video>
              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10" />
              <span className="absolute bottom-4 left-4 rounded-full bg-ink/60 px-3 py-1 font-mono text-[0.6rem] uppercase tracking-kicker text-paper backdrop-blur-sm">
                ● Our studio · Bluffton
              </span>
            </div>
            {/* Lowcountry inset */}
            <div className="absolute -bottom-6 -right-2 hidden aspect-[4/3] w-1/3 overflow-hidden rounded-sm border-4 border-paper bg-bone shadow-xl sm:block lg:-right-6">
              <Image src={IMAGES.lowcountry} alt="The Lowcountry" fill sizes="20vw" className="object-cover" />
            </div>
          </div>

          <div data-reveal data-reveal-delay={120}>
            <span className="kicker text-ocean">The studio</span>
            <h2 className="mt-4 font-display font-light leading-[0.95] tracking-tight text-huge">
              A bright, white-cyc studio in the
              <em className="italic"> heart </em>
              of Bluffton.
            </h2>
            <p className="mt-6 max-w-lg font-grotesk text-base leading-relaxed opacity-75">
              Our home base is a clean, professional cyclorama studio in Old Town
              Bluffton — cinema cameras, pro lighting, and a podcast-ready setup,
              all under one roof. Come shoot portraits, products, interviews, or a
              full brand campaign in a space built for it.
            </p>
            <p className="mt-4 max-w-lg font-grotesk text-base leading-relaxed opacity-75">
              We work with healthcare systems, real estate firms, cultural
              institutions, nonprofits, and local governments to create media that
              informs, connects, and supports real business goals — across the
              Lowcountry and beyond.
            </p>

            <blockquote className="mt-10 border-l-2 border-ocean pl-6">
              <p className="font-display text-2xl font-light italic leading-snug sm:text-3xl">
                &ldquo;Clear storytelling and thoughtful production are at the
                center of every project we deliver.&rdquo;
              </p>
              <footer className="mt-4 font-mono text-xs uppercase tracking-kicker opacity-70">
                {SITE.contactName} — {SITE.contactRole}
              </footer>
            </blockquote>

            <div className="mt-8 flex flex-wrap gap-x-10 gap-y-4 font-mono text-xs uppercase tracking-kicker opacity-70">
              <span>{SITE.location}</span>
              <span>{SITE.region}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
