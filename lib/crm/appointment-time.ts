import type { Appointment } from "./scheduling-types";

/** A source date hold must never look like a confirmed midnight arrival. */
export function appointmentTimeLabel(a: Pick<Appointment, "starts_at" | "ends_at" | "timezone" | "source_evidence">) {
  const start = new Date(a.starts_at), end = new Date(a.ends_at);
  const date = new Intl.DateTimeFormat("en-US", { timeZone: a.timezone, weekday: "short", month: "short", day: "numeric", year: "numeric" });
  if (a.source_evidence?.all_day === true) {
    const lastDay = date.format(new Date(end.getTime() - 1));
    const days = date.format(start) === lastDay ? date.format(start) : `${date.format(start)} – ${lastDay}`;
    return `${days} · All-day hold; confirm coverage times`;
  }
  const time = new Intl.DateTimeFormat("en-US", { timeZone: a.timezone, hour: "numeric", minute: "2-digit" });
  return `${date.format(start)}, ${time.format(start)} – ${date.format(start) === date.format(end) ? "" : `${date.format(end)}, `}${time.format(end)}`;
}
