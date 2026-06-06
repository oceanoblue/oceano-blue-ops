import { STATS } from '@/lib/content';

export function Stats() {
  return (
    <section className="border-y border-ink/15 bg-paper">
      <div className="container-edge grid grid-cols-2 divide-x divide-ink/15 lg:grid-cols-4">
        {STATS.map((s, i) => (
          <div
            key={s.label}
            className={`flex flex-col gap-2 py-10 ${i % 2 === 1 ? 'pl-6 sm:pl-8' : 'pr-6 sm:pr-8'} ${
              i >= 2 ? 'border-t border-ink/15 lg:border-t-0' : ''
            } lg:px-8`}
            data-reveal
            data-reveal-delay={i * 80}
          >
            <span className="font-display text-5xl font-light leading-none tracking-tight sm:text-6xl md:text-7xl">
              {s.value}
            </span>
            <span className="font-mono text-[0.7rem] uppercase tracking-kicker opacity-60">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
