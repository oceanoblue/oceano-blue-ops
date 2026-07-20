import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/ui/BrandLogo';

/**
 * Bold client-portal hero banner: a deep ink gradient with film-grain texture,
 * an accent eyebrow, a large serif headline, and an optional back link + action
 * slot. Shared across the portal so every page opens with the same confident,
 * branded masthead.
 */
export function PortalHero({
  eyebrow = 'Client Portal',
  title,
  subtitle,
  backHref,
  backLabel = 'Back',
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  children?: ReactNode;
}) {
  return (
    <header className="grain relative overflow-hidden bg-gradient-to-br from-ink-900 to-ink-950 text-white">
      {/* soft ocean glow */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-ocean-500/20 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-6 py-9 sm:py-11">
        <BrandLogo variant="white" className="mb-4 h-6 w-auto" />
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-ink-300 transition hover:text-white"
          >
            ← {backLabel}
          </Link>
        )}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            {eyebrow && (
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-ocean-300">
                {eyebrow}
              </div>
            )}
            <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {title}
            </h1>
            {subtitle && <p className="mt-2 max-w-xl text-sm text-ink-300">{subtitle}</p>}
          </div>
          {children && <div className="flex items-center gap-2">{children}</div>}
        </div>
      </div>
    </header>
  );
}
