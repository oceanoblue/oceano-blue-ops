'use client';

import { useEffect } from 'react';

/**
 * Translates any [data-parallax] element vertically as it passes through the
 * viewport. The attribute value is the strength (e.g. 0.12). Put it on an
 * element inside an `overflow-hidden` container whose media is scaled up a touch
 * so the movement never reveals an edge.
 */
export function Parallax() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
    if (els.length === 0) return;

    let raf = 0;
    const update = () => {
      const vh = window.innerHeight;
      for (const el of els) {
        const speed = parseFloat(el.dataset.parallax || '0.1');
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const offset = (center - vh / 2) * -speed;
        el.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
      }
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
