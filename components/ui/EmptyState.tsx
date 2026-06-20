import type { ComponentType, ReactNode } from 'react';

/**
 * Consistent empty-state block: a muted icon medallion, a title, an optional
 * description, and an optional action. Replaces the bare "No X yet" one-liners
 * scattered across list pages and panels. Works inside a table cell (it's a
 * centered flex block) or any container.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${
        compact ? 'px-4 py-8' : 'px-6 py-14'
      }`}
    >
      {Icon && (
        <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
