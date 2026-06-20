import { STATUS_LABEL, STATUS_COLOR } from '@/lib/utils/format';

/**
 * Status pill. Centralizes the repeated `<span className="pill ${STATUS_COLOR[s]}">
 * {STATUS_LABEL[s]}</span>` pattern so colors/labels stay consistent everywhere.
 *
 * Falls back gracefully for statuses outside the order map (e.g. listing
 * statuses): a neutral slate pill with a humanized label, so it's safe to point
 * at any status string.
 *
 * Server component.
 */
const FALLBACK_COLOR = 'bg-slate-100 text-slate-700';

function humanize(s: string) {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({
  status,
  label,
  className = '',
}: {
  status: string | null | undefined;
  /** Override the displayed text (defaults to the mapped/humanized label). */
  label?: string;
  className?: string;
}) {
  if (!status) return <span className={`pill ${FALLBACK_COLOR} ${className}`}>—</span>;
  const color = STATUS_COLOR[status] ?? FALLBACK_COLOR;
  const text = label ?? STATUS_LABEL[status] ?? humanize(status);
  return <span className={`pill ${color} ${className}`}>{text}</span>;
}
