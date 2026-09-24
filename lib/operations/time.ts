export function localClock(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = (type: string) => parts.find((v) => v.type === type)!.value;
  return {
    date: `${p("year")}-${p("month")}-${p("day")}`,
    time: `${p("hour")}:${p("minute")}`,
  };
}
export function isValidTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
export function dayBounds(date: string, timezone: string) {
  // Solve each local midnight separately: DST days can be 23 or 25 hours.
  function midnight(day: string) {
    const target = Date.parse(`${day}T00:00:00Z`);
    let instant = target;
    for (let i = 0; i < 4; i++) {
      const clock = localClock(new Date(instant), timezone);
      const represented = Date.parse(`${clock.date}T${clock.time}:00Z`);
      const delta = target - represented;
      if (!delta) break;
      instant += delta;
    }
    return new Date(instant).toISOString();
  }
  const tomorrow = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
  return { start: midnight(date), end: midnight(tomorrow) };
}
export function shouldRun(
  now: Date,
  settings: { enabled: boolean; timezone: string; brief_time: string },
) {
  return (
    settings.enabled &&
    localClock(now, settings.timezone).time >= settings.brief_time.slice(0, 5)
  );
}
