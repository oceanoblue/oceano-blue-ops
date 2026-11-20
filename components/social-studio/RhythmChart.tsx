"use client";

import { useState } from "react";
import type { RhythmDay } from "@/lib/social/summary";
import { VIZ } from "./Charts";

const PLOT_HEIGHT = 144;

/** The smallest tidy number at or above `n` that splits into two even steps. */
function niceMax(n: number): number {
  if (n <= 2) return 2;
  if (n <= 4) return 4;
  if (n <= 6) return 6;
  if (n <= 10) return 10;
  return Math.ceil(n / 10) * 10;
}

/**
 * How a month's pieces are spread across its days: one thin column per day,
 * stacked into what is scheduled or live and what is still in production.
 * Pointing at a day, or moving through the days with the arrow keys, shows
 * its numbers; the same numbers are in a table for screen readers.
 */
export function RhythmChart({ days, today, month }: { days: RhythmDay[]; today: number | null; month: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...days.map((d) => d.done + d.open)));
  const ticks = [max, max / 2, 0];
  const height = (n: number) => (n / max) * PLOT_HEIGHT;
  const shown = active === null ? null : days[active];
  const marks = new Set([1, 5, 10, 15, 20, 25, days.length]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Escape") return;
    e.preventDefault();
    if (e.key === "Escape") return setActive(null);
    const step = e.key === "ArrowRight" ? 1 : -1;
    setActive((i) => Math.min(days.length - 1, Math.max(0, (i ?? (step > 0 ? -1 : days.length)) + step)));
  }

  return (
    <figure className="min-w-0">
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: VIZ.blue }} />
          Scheduled or live
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: VIZ.blueLight }} />
          Still in production
        </li>
      </ul>

      <div
        className="relative flex gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ocean-500"
        tabIndex={0}
        role="group"
        aria-label={`Pieces by planned date in ${month}. Use the left and right arrow keys to read each day.`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        {/* Value axis */}
        <div aria-hidden="true" className="relative w-5 shrink-0 text-right text-[11px] tabular-nums text-slate-500" style={{ height: PLOT_HEIGHT }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: PLOT_HEIGHT - height(t) }}>
              {t}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            {ticks.map((t) => (
              <span key={t} aria-hidden="true" className="absolute inset-x-0 h-px" style={{ top: PLOT_HEIGHT - height(t), backgroundColor: t === 0 ? VIZ.axis : VIZ.grid }} />
            ))}
            <div className="absolute inset-0 flex items-end">
              {days.map((d, i) => (
                <div key={d.day} className="flex h-full min-w-0 flex-1 items-end justify-center" onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)}>
                  <div className={`flex w-full max-w-6 flex-col-reverse gap-0.5 px-px transition-opacity ${active !== null && active !== i ? "opacity-45" : ""}`}>
                    {d.done > 0 && <span className={d.open > 0 ? "" : "rounded-t-[4px]"} style={{ height: Math.max(2, height(d.done)), backgroundColor: VIZ.blue }} />}
                    {d.open > 0 && <span className="rounded-t-[4px]" style={{ height: Math.max(2, height(d.open)), backgroundColor: VIZ.blueLight }} />}
                  </div>
                </div>
              ))}
            </div>
            {shown && (
              <div
                role="status"
                className="pointer-events-none absolute top-0 z-10 w-44 -translate-y-2 rounded-lg bg-ink-950 px-3 py-2 text-xs text-white shadow-lift"
                style={{ left: `clamp(0px, calc(${((active! + 0.5) / days.length) * 100}% - 5.5rem), calc(100% - 11rem))` }}
              >
                <p className="text-ink-200">{shown.label}</p>
                <p className="mt-1 flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ backgroundColor: "#5598e7" }} />
                  <strong className="tabular-nums">{shown.done}</strong> scheduled or live
                </p>
                <p className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ backgroundColor: VIZ.blueLight }} />
                  <strong className="tabular-nums">{shown.open}</strong> in production
                </p>
              </div>
            )}
          </div>

          {/* Day axis */}
          <div aria-hidden="true" className="mt-1.5 flex text-[11px] tabular-nums text-slate-500">
            {days.map((d) => (
              <span key={d.day} className={`min-w-0 flex-1 text-center ${d.day === today ? "font-bold text-ocean-700" : ""}`}>
                {d.day === today || (marks.has(d.day) && (today === null || Math.abs(d.day - today) > 1)) ? d.day : ""}
              </span>
            ))}
          </div>
          {today !== null && (
            <p aria-hidden="true" className="mt-1 text-[11px] text-slate-500">
              <span className="font-bold text-ocean-700">{today}</span> is today
            </p>
          )}
        </div>
      </div>

      <table className="sr-only">
        <caption>Pieces by planned date in {month}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Scheduled or live</th>
            <th scope="col">Still in production</th>
          </tr>
        </thead>
        <tbody>
          {days
            .filter((d) => d.done + d.open > 0)
            .map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.label}</th>
                <td>{d.done}</td>
                <td>{d.open}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  );
}
