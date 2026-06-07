'use client';

import { useEffect, useRef, useState } from 'react';
import { STATS } from '@/lib/content';

/** Split "143+" / "5.0" / "100%" into prefix, numeric target, suffix, decimals. */
function parse(value: string) {
  const m = value.match(/^([^\d.-]*)([\d.,]+)(.*)$/);
  if (!m) return { prefix: '', target: 0, suffix: value, decimals: 0 };
  const numStr = m[2].replace(/,/g, '');
  const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0;
  return { prefix: m[1], target: parseFloat(numStr), suffix: m[3], decimals };
}

function CountUp({ value }: { value: string }) {
  const { prefix, target, suffix, decimals } = parse(value);
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(target);
      return;
    }

    let started = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started) return;
        started = true;
        io.disconnect();
        const duration = 1700;
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
          setDisplay(p < 1 ? target * eased : target);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

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
                <CountUp value={s.value} />
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
