import { STATS } from '@/lib/content';

export function Stats() {
  return (
    <section className="bg-paper">
      <div className="container-edge">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm bg-ink/12 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="flex flex-col justify-center gap-3 bg-paper px-5 py-12 sm:px-7"
              data-reveal
              data-reveal-delay={i * 80}
            >
              <span className="font-display text-4xl font-light leading-none tracking-tight sm:text-5xl">
                {s.value}
              </span>
              <span className="font-mono text-[0.65rem] uppercase tracking-kicker opacity-55">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
