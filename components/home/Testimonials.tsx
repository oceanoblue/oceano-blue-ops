import { Star, Quote } from 'lucide-react';
import { TESTIMONIALS } from '@/lib/content';

export function Testimonials() {
  return (
    <section className="bg-ink py-20 text-paper sm:py-28">
      <div className="container-edge">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-reveal>
          <div>
            <span className="kicker text-ocean-soft">Testimonials</span>
            <h2 className="mt-4 font-display font-light leading-[0.9] tracking-tight text-giant">
              What our clients
              <br />
              are <em className="italic">saying.</em>
            </h2>
          </div>
          <div className="flex items-center gap-2 text-ocean-soft">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-current" />
            ))}
          </div>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <figure
              key={t.name}
              className="flex flex-col justify-between rounded-sm border border-paper/15 bg-paper/[0.03] p-7 transition-colors duration-300 hover:bg-paper/[0.06]"
              data-reveal
              data-reveal-delay={i * 90}
            >
              <div>
                <Quote className="h-7 w-7 text-ocean-soft" />
                <div className="mt-4 flex gap-1 text-ocean-soft">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
                <blockquote className="mt-5 font-display text-xl font-light leading-snug tracking-tight">
                  {t.quote}
                </blockquote>
              </div>
              <figcaption className="mt-8 border-t border-paper/15 pt-5">
                <div className="font-grotesk text-sm font-semibold">{t.name}</div>
                <div className="font-mono text-[0.65rem] uppercase tracking-kicker text-paper/55">
                  {t.org}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
