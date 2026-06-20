import type { ComponentType, ReactNode } from 'react';

/**
 * Consistent page header across every dashboard list/detail page.
 *
 * Bolder editorial treatment: an optional accent eyebrow, a large serif title,
 * an optional gradient icon medallion, and a subtle bottom rule. `children` is
 * the right-aligned action slot (e.g. a "New order" button).
 *
 * Server component — safe to use directly in server pages.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  icon: Icon,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100/70 pb-5">
      <div className="flex items-start gap-3.5">
        {Icon && (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-ocean-500 to-ocean-700 text-white shadow-soft">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ocean-600">
              {eyebrow}
            </div>
          )}
          <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-ocean-950 sm:text-3xl">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
