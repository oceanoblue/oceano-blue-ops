'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

export function Preloader() {
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>('in');

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const markLoaded = () => document.documentElement.classList.add('loaded');

    if (reduce) {
      markLoaded();
      setPhase('done');
      return;
    }

    document.body.style.overflow = 'hidden';
    const t1 = setTimeout(() => {
      markLoaded();
      setPhase('out');
    }, 1500);
    const t2 = setTimeout(() => {
      setPhase('done');
      document.body.style.overflow = '';
    }, 2500);

    // Safety: never trap the page if timers are throttled
    const safety = setTimeout(markLoaded, 4000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(safety);
      document.body.style.overflow = '';
    };
  }, []);

  if (phase === 'done') return null;

  return (
    <div className={`preloader ${phase === 'out' ? 'preloader--out' : ''}`} aria-hidden>
      <div className="preloader__inner">
        <Image src="/brand/mark-blue.png" alt="" width={64} height={84} className="preloader__mark h-16 w-auto" priority />
        <span className="preloader__kicker font-mono">Oceano Blue Media</span>
        <span className="preloader__bar">
          <span className="preloader__fill" />
        </span>
      </div>
    </div>
  );
}
