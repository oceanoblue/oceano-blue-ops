/** Wall-clock inputs always use the appointment's timezone, not the office browser's. */
export function scheduleInput(iso: string | null, timezone: string): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function inputInstant(value: string, timezone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose both a start and an end time.');
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall)) throw new Error('Choose a valid date and time.');
  let instant = wall;
  for (let i = 0; i < 4; i++) {
    const shown = scheduleInput(new Date(instant).toISOString(), timezone);
    if (shown === value) return instant;
    instant += wall - Date.parse(`${shown}:00Z`);
  }
  throw new Error('That local time does not exist because of a daylight-saving change. Choose another time.');
}

export function scheduleWindow(from: string, to: string, timezone: string) {
  const start = inputInstant(from, timezone);
  const end = inputInstant(to, timezone);
  const duration = (end - start) / 60000;
  if (duration <= 0) throw new Error('The end time must be after the start time.');
  if (!Number.isInteger(duration) || duration < 15 || duration > 720) throw new Error('Choose an appointment between 15 minutes and 12 hours.');
  return { scheduledAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), duration };
}
