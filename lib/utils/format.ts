import { formatDistanceToNow } from 'date-fns';

/**
 * The business runs on Eastern time. Every timestamp is stored in UTC and must
 * be RENDERED in this zone — never the machine's clock. On Vercel the server
 * clock is UTC, so a naive format() shows "11:35 PM" for a 7:35 PM accept.
 */
export const BUSINESS_TZ = process.env.NEXT_PUBLIC_BUSINESS_TZ || 'America/New_York';

function toDate(d: string | Date): Date {
  return typeof d === 'string' ? new Date(d) : d;
}

function parts(d: Date, tz: string, opts: Intl.DateTimeFormatOptions) {
  const list = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz }).formatToParts(d);
  return (t: string) => list.find((p) => p.type === t)?.value ?? '';
}

/** "Sep 7, 2026" in the business timezone. */
export function fmtDate(d: string | Date | null | undefined, tz: string = BUSINESS_TZ) {
  if (!d) return '—';
  const g = parts(toDate(d), tz, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${g('month')} ${g('day')}, ${g('year')}`;
}

/** "Sep 7, 2026 at 7:35 PM" in the business timezone. */
export function fmtDateTime(d: string | Date | null | undefined) {
  return fmtDateTimeTz(d, BUSINESS_TZ);
}

/**
 * Like fmtDateTime but rendered in a specific IANA timezone (e.g. the shoot's
 * own `timezone` column). Falls back to the business timezone, never the
 * server's.
 */
export function fmtDateTimeTz(d: string | Date | null | undefined, tz?: string | null) {
  if (!d) return '—';
  const g = parts(toDate(d), tz || BUSINESS_TZ, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  return `${g('month')} ${g('day')}, ${g('year')} at ${g('hour')}:${g('minute')} ${g('dayPeriod')}`;
}

/** "7:35 PM" in the business timezone (or the given one). */
export function fmtTime(d: string | Date | null | undefined, tz: string = BUSINESS_TZ) {
  if (!d) return '—';
  const g = parts(toDate(d), tz, { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${g('hour')}:${g('minute')} ${g('dayPeriod')}`;
}

/** "Wednesday, Sep 9, 2026" in the business timezone (or the given one). */
export function fmtDayLong(d: string | Date | null | undefined, tz: string = BUSINESS_TZ) {
  if (!d) return '—';
  const g = parts(toDate(d), tz, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  return `${g('weekday')}, ${g('month')} ${g('day')}, ${g('year')}`;
}

export function fmtRelative(d: string | Date | null | undefined) {
  if (!d) return '—';
  return formatDistanceToNow(typeof d === 'string' ? new Date(d) : d, { addSuffix: true });
}

export function fmtCents(cents: number | null | undefined) {
  if (cents == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function fmtAddress(l: {
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  zip: string;
}) {
  const l2 = l.address_line2 ? ` ${l.address_line2}` : '';
  return `${l.address_line1}${l2}, ${l.city}, ${l.state} ${l.zip}`;
}

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  booked: 'Booked',
  scheduled: 'Scheduled',
  shooting: 'On site',
  uploaded: 'Uploaded',
  processing: 'AI processing',
  editing: 'In editing',
  ready: 'Ready to deliver',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  booked: 'bg-blue-100 text-blue-700',
  scheduled: 'bg-indigo-100 text-indigo-700',
  shooting: 'bg-amber-100 text-amber-700',
  uploaded: 'bg-cyan-100 text-cyan-700',
  processing: 'bg-purple-100 text-purple-700',
  editing: 'bg-fuchsia-100 text-fuchsia-700',
  ready: 'bg-emerald-100 text-emerald-700',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-rose-100 text-rose-700',
};
