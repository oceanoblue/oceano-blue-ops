import { SITE } from '@/lib/content';

export function Studio() {
  return (
    <section id="studio" className="bg-paper py-20 sm:py-28">
      <div className="container-edge">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div data-reveal>
            <span className="kicker text-ocean">About Oceano Blue Media</span>
            <div className="mt-8 flex flex-wrap gap-x-10 gap-y-4 font-mono text-xs uppercase tracking-kicker opacity-60">
              <span>{SITE.location}</span>
              <span>{SITE.region}</span>
            </div>
          </div>

          <div data-reveal data-reveal-delay={120}>
            <h2 className="font-display font-light leading-[0.98] tracking-tight text-huge">
              We help organizations communicate clearly through video and visual
              <em className="italic"> storytelling.</em>
            </h2>
            <p className="mt-8 max-w-xl font-grotesk text-base leading-relaxed opacity-75">
              Oceano Blue Media is a visual production studio specializing in
              commercial video, photography, and digital content.
            </p>
            <p className="mt-4 max-w-xl font-grotesk text-base leading-relaxed opacity-75">
              We work with healthcare systems, real estate firms, cultural
              institutions, nonprofits, and local governments to create media that
              informs, connects, and supports real business goals.
            </p>
            <a href="#services" className="btn-blue mt-10 text-xs">
              Explore our services
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
