import { useEffect, useRef, useState } from 'react';

/**
 * Lazy-render gate for grid items via IntersectionObserver.
 *
 * A large photo order can hold 75–120 thumbnails; mounting every card's
 * signed-URL fetch + full-res <img> (and, for RAW brackets, a worker
 * preview call) at once janks the page and hammers the photo endpoints.
 * Attach the returned `ref` to a card's root and gate its fetch + image on
 * `inView` so work only happens once the card scrolls within `rootMargin` of
 * the viewport. Latches `true` on first intersection (no refetch flicker on
 * scroll-out), and degrades to always-visible where IntersectionObserver is
 * unavailable (SSR / very old browsers).
 */
export function useInView<T extends HTMLElement>(rootMargin = '400px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView, rootMargin]);
  return { ref, inView };
}
