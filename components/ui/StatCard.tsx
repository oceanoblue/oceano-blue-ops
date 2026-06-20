import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';

/**
 * Compact metric tile for dashboards. Optional icon + hint, and when `href` is
 * given it becomes an interactive card that links to the filtered view.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  hint,
  accent = false,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  href?: string;
  hint?: ReactNode;
  /** Tint the value in the ocean accent (e.g. an at-a-glance KPI). */
  accent?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-500">
          {label}
        </div>
        {Icon && <Icon className="h-4 w-4 text-slate-300" />}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accent ? 'text-ocean-700' : 'text-ocean-950'}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card card-interactive block p-4">
      {inner}
    </Link>
  ) : (
    <div className="card p-4">{inner}</div>
  );
}
