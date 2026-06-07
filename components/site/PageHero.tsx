export function PageHero({
  kicker,
  title,
  intro,
}: {
  kicker: string;
  title: React.ReactNode;
  intro?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-ink pb-16 pt-36 text-paper sm:pb-24 sm:pt-44">
      <div className="grain-overlay pointer-events-none absolute inset-0 overflow-hidden" />
      <div className="absolute -right-32 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rounded-full bg-ocean/20 blur-[120px]" />
      <div className="container-edge relative z-10">
        <span className="kicker text-ocean-soft" data-reveal>{kicker}</span>
        <h1
          className="mt-5 max-w-[16ch] font-display font-light leading-[0.92] tracking-tight text-giant"
          data-reveal
          data-reveal-delay={80}
        >
          {title}
        </h1>
        {intro && (
          <p
            className="mt-7 max-w-xl font-grotesk text-base leading-relaxed text-paper/70 sm:text-lg"
            data-reveal
            data-reveal-delay={160}
          >
            {intro}
          </p>
        )}
      </div>
    </section>
  );
}
