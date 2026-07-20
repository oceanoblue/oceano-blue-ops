/* eslint-disable @next/next/no-img-element */

/**
 * Brand assets (public/brand/, sourced from the official logo set):
 *  - lockup-dark.png  — blue mark + black wordmark, for LIGHT backgrounds
 *  - lockup-white.png — blue mark + white wordmark, for DARK backgrounds
 *  - mark.png         — the blue diamond mark alone (square)
 */

export function BrandLogo({
  variant,
  className = 'h-8 w-auto',
}: {
  /** 'dark' text (light backgrounds) or 'white' text (dark backgrounds). */
  variant: 'dark' | 'white';
  className?: string;
}) {
  return (
    <img
      src={`/brand/lockup-${variant}.png`}
      alt="Oceano Blue Media"
      className={className}
      draggable={false}
    />
  );
}

export function BrandMark({ className = 'h-9 w-auto' }: { className?: string }) {
  return (
    <img
      src="/brand/mark.png"
      alt="Oceano Blue"
      className={className}
      draggable={false}
    />
  );
}
