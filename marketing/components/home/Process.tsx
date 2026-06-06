import { PROCESS } from '@/lib/content';

export function Process() {
  return (
    <section id="process" className="bg-ocean-deep py-20 text-paper sm:py-28">
      <div className="container-edge">
        <div className="max-w-3xl" data-reveal>
          <span className="kicker text-ocean-soft">How it works</span>
          <h2 className="mt-4 font-display font-light leading-[0.95] tracking-tight text-huge">
            From first call to
            <em className="italic"> final cut.</em>
          </h2>
          <p className="mt-6 max-w-xl font-grotesk text-base leading-relaxed text-paper/70">
            A clear, calm process that keeps you in the loop and gets you
            something extraordinary — on time, every time.
          </p>
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-sm border border-paper/15 bg-paper/15 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS.map((step, i) => (
            <div
              key={step.no}
              className="group flex flex-col gap-6 bg-ocean-deep p-7 transition-colors duration-300 hover:bg-ocean"
              data-reveal
              data-reveal-delay={i * 90}
            >
              <span className="font-mono text-sm text-ocean-soft transition-colors group-hover:text-white">
                {step.no}
              </span>
              <h3 className="font-display text-3xl font-light leading-none tracking-tight">
                {step.title}
              </h3>
              <p className="font-grotesk text-sm leading-relaxed text-paper/70 transition-colors group-hover:text-paper/90">
                {step.blurb}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
