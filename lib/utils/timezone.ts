/**
 * Tiny timezone helpers. We avoid pulling in date-fns-tz to keep bundle slim;
 * for slot generation we only need: given a wall-clock time on a date in a
 * specific IANA timezone, return the equivalent UTC instant.
 */

/**
 * Returns the UTC `Date` representing `YYYY-MM-DD` `HH:MM` in `timezone`.
 * Works by inverting Intl.DateTimeFormat — accurate within 1ms for normal use.
 */
export function localToUtc(dateStr: string, hhmm: string, timezone: string): Date {
  // Start with the wall-clock value treated as UTC.
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, h, min, 0, 0);
  // Find what that UTC instant looks like in the target zone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const localised = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  // Difference = how much the guess is "ahead" of the zone-local interpretation.
  const offsetMs = localised - utcGuess;
  return new Date(utcGuess - offsetMs);
}

/** Return day-of-week (0=Sun..6=Sat) for the given date in the given timezone. */
export function dayOfWeekInTz(dateStr: string, timezone: string): number {
  const utcMidday = localToUtc(dateStr, '12:00', timezone);
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
      .formatToParts(utcMidday)
      .find((p) => p.type === 'weekday')!.value
      .replace('Sun', '0')
      .replace('Mon', '1')
      .replace('Tue', '2')
      .replace('Wed', '3')
      .replace('Thu', '4')
      .replace('Fri', '5')
      .replace('Sat', '6')
  );
}
