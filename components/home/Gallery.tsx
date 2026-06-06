import { GALLERY } from '@/lib/content';

export function Gallery() {
  return (
    <section className="bg-paper py-20 sm:py-28">
      <div className="container-edge">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-reveal>
          <div>
            <span className="kicker text-ocean">From the field</span>
            <h2 className="mt-4 font-display font-light leading-[0.9] tracking-tight text-giant">
              Frames we&apos;ve
              <br />
              <em className="italic">captured.</em>
            </h2>
          </div>
          <a
            href="#contact"
            data-cursor
            className="btn-outline border-ink/30 text-ink hover:bg-ink hover:text-paper"
          >
            Start your project
          </a>
        </div>

        <div className="mt-12 columns-2 gap-4 md:columns-3 lg:columns-4 [&>*]:mb-4">
          {GALLERY.map((g, i) => (
            <figure
              key={i}
              data-cursor
              data-cursor-label="View"
              className="group relative block break-inside-avoid overflow-hidden rounded-sm bg-bone"
              data-reveal
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.src}
                alt={g.cat}
                loading="lazy"
                className="w-full object-cover transition-transform duration-[1.2s] ease-editorial group-hover:scale-105"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <figcaption className="absolute bottom-0 left-0 p-4 font-mono text-[0.6rem] uppercase tracking-kicker text-paper opacity-0 transition-all duration-500 group-hover:opacity-100">
                {g.cat}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
