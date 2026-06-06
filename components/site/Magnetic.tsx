'use client';

import { useEffect } from 'react';

/**
 * Gives any [data-magnetic] element a subtle magnetic pull toward the cursor
 * while hovered, snapping back on leave. Desktop / fine-pointer only.
 */
export function Magnetic() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-magnetic]'));
    const cleanups: Array<() => void> = [];
    const strength = 0.35;

    els.forEach((el) => {
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
      };
      const onLeave = () => {
        el.style.transform = '';
      };
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onLeave);
      cleanups.push(() => {
        el.removeEventListener('mousemove', onMove);
        el.removeEventListener('mouseleave', onLeave);
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
