import type { ReactNode } from "react";

/**
 * Chart colors for Social Studio. One blue ramp for amounts and progress, and
 * the reserved status colors for good / warning / critical, which always ship
 * with a label. Text never takes these colors: it stays ink or slate.
 */
export const VIZ = {
  /** The one series color: bars, and the "done" part of a meter. */
  blue: "#2a78d6",
  /** A lighter step of the same blue: work still in production. */
  blueLight: "#86b6ef",
  /** The unfilled part of a meter. */
  track: "#e3edf9",
  /** Five ordered steps of the same blue, light to dark, for a piece's journey to live. */
  ramp: ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#0d366b"],
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
  grid: "#e6e9ee",
  axis: "#c5ccd6",
} as const;

/**
 * Progress against a total, as one thin bar: the part that is done, then the
 * part still being worked on, on a light track. The numbers are always
 * written beside it by the caller, so the bar never has to be read alone.
 */
export function Meter({
  done,
  inProgress = 0,
  total,
  label,
  dark = false,
  thick = false,
}: {
  done: number;
  inProgress?: number;
  total: number;
  /** Read by screen readers in place of the bar. */
  label: string;
  /** On a dark surface. */
  dark?: boolean;
  thick?: boolean;
}) {
  const of = Math.max(total, done + inProgress, 1);
  const pct = (n: number) => `${(Math.max(0, n) / of) * 100}%`;
  return (
    <div
      role="img"
      aria-label={label}
      className={`flex w-full gap-0.5 overflow-hidden rounded-full ${thick ? "h-2.5" : "h-2"}`}
      style={{ backgroundColor: dark ? "rgba(255,255,255,0.14)" : VIZ.track }}
    >
      {done > 0 && <span className="h-full rounded-full" style={{ width: pct(done), backgroundColor: dark ? "#5598e7" : VIZ.blue }} />}
      {inProgress > 0 && <span className="h-full rounded-full" style={{ width: pct(inProgress), backgroundColor: dark ? "rgba(134,182,239,0.55)" : VIZ.blueLight }} />}
    </div>
  );
}

/** A card with a title and one line saying what the chart shows. */
export function ChartCard({ title, note, action, children, className = "" }: { title: string; note?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card flex min-w-0 flex-col p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ocean-950">{title}</h2>
          {note && <p className="mt-0.5 text-sm text-slate-600">{note}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4 flex min-w-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/**
 * Amounts for a list of named things, one horizontal bar each, all in one
 * color and all starting from the same edge so they compare exactly. The
 * value is printed at the end of every bar. Rows stay in the order given:
 * pass stages in their natural order, or anything else largest first.
 */
export function BarList({ rows, unit }: { rows: { label: string; value: number; hint?: string }[]; unit: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="contents" title={`${r.label}: ${unit(r.value)}`}>
          <dt className={`whitespace-nowrap ${r.value > 0 ? "text-ink-900" : "text-slate-400"}`}>{r.label}</dt>
          <dd className="flex min-w-0 items-center gap-2">
            {r.value > 0 && <span className="h-2.5 shrink-0 rounded-r-[4px]" style={{ width: `calc((100% - 2.5rem) * ${r.value / max})`, minWidth: 3, backgroundColor: VIZ.blue }} />}
            <span className={`tabular-nums ${r.value > 0 ? "font-semibold text-ink-900" : "text-slate-400"}`}>{r.value}</span>
            {r.hint && <span className="truncate text-xs text-slate-500">{r.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export type Part = { label: string; value: number; color: string; /** Print the number in near-black instead of white (for light fills). */ darkText?: boolean; icon?: ReactNode };

/**
 * One whole split into a few parts, as a single tall bar with a legend. Each
 * part prints its count when there is room; a part too narrow for its number
 * shows it in the legend instead, so no value is ever hidden.
 */
export function SegmentedBar({ name, parts, unit }: { name: string; parts: Part[]; unit: (n: number) => string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const fits = (p: Part) => total > 0 && p.value / total >= 0.1;
  if (total === 0) return <p className="text-sm text-slate-500">Nothing to show yet.</p>;
  return (
    <div>
      <div role="img" aria-label={`${name}: ${parts.map((p) => `${p.label} ${unit(p.value)}`).join(", ")}`} className="flex h-7 w-full gap-0.5">
        {parts.map((p) =>
          p.value > 0 ? (
            <span
              key={p.label}
              title={`${p.label}: ${unit(p.value)} (${Math.round((p.value / total) * 100)}%)`}
              className={`flex h-full items-center rounded-[4px] px-2 text-xs font-semibold tabular-nums ${p.darkText ? "text-ink-950" : "text-white"}`}
              style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }}
            >
              {fits(p) ? p.value : ""}
            </span>
          ) : null,
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-700">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: p.color }} />
            {p.icon}
            <span>{p.label}</span>
            {!fits(p) && <span className="font-semibold tabular-nums text-ink-900">{p.value}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
