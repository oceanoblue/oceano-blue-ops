import { SITE } from '@/lib/content';

export function StudioStory() {
  return (
    <section className="bg-paper py-20 sm:py-28">
      <div className="container-edge grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Looping studio footage — a calmer, inline treatment (no scroll-scrub) */}
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-bone sm:aspect-[5/4] lg:aspect-[4/5]" data-reveal>
          <video
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            poster="/studio/studio-hq-poster.jpg"
          >
            <source src="/studio/studio-loop.mp4" type="video/mp4" />
          </video>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/35 to-transparent" />
          <span className="absolute bottom-5 left-5 font-mono text-[0.65rem] uppercase tracking-kicker text-paper/90">
            The studio — {SITE.location}
          </span>
        </div>

        <div data-reveal data-reveal-delay={120}>
          <span className="kicker text-ocean">Our story</span>
          <h2 className="mt-5 font-display font-light leading-[0.98] tracking-tight text-huge">
            A real studio, run by people who actually
            <em className="italic"> roll the cameras.</em>
          </h2>
          <p className="mt-8 max-w-xl font-grotesk text-base leading-relaxed opacity-75">
            Oceano Blue Media is a hands-on video and photography studio in Old
            Town Bluffton. No middlemen, no farmed-out crews — the people you
            meet are the people who light the set, run the cameras, and cut the
            final edit.
          </p>
          <p className="mt-4 max-w-xl font-grotesk text-base leading-relaxed opacity-75">
            We built a space where brands across the Lowcountry can show up and
            look their best: a clean studio, cinema-grade gear, and a calm,
            collaborative set where good work gets made without the drama.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-sm bg-ink/12">
            {[
              { v: '5.0', l: 'Google rating' },
              { v: '143+', l: 'Projects delivered' },
              { v: '2023', l: 'Est. in Bluffton' },
            ].map((s) => (
              <div key={s.l} className="bg-paper px-4 py-6">
                <div className="font-display text-3xl font-light tracking-tight">{s.v}</div>
                <div className="mt-1 font-mono text-[0.6rem] uppercase tracking-kicker opacity-55">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
