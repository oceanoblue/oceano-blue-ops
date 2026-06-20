import type { ReactNode } from 'react';

/**
 * Consistent page header used across every dashboard list/detail page.
 *
 * Replaces the copy-pasted `<div className="flex items-center justify-between">
 * … <h1>…</h1><p>…</p> … <action/></div>` block. `children` is the right-aligned
 * action slot (e.g. a "New order" button); omit it for header-only pages.
 *
 * Server component — safe to use directly in server pages.
 */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600 mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
