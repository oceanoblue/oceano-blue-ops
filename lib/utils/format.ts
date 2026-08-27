import { format, formatDistanceToNow } from 'date-fns';

export function fmtDate(d: string | Date | null | undefined, pattern = 'MMM d, yyyy') {
  if (!d) return '—';
  return format(typeof d === 'string' ? new Date(d) : d, pattern);
}

export function fmtDateTime(d: string | Date | null | undefined) {
  return fmtDate(d, "MMM d, yyyy 'at' h:mm a");
}

/**
 * Like fmtDateTime but rendered in a specific IANA timezone (e.g. the shoot's
 * `America/New_York`). Uses Intl so a UTC-stored instant shows the LOCAL shoot
 * time, matching the Schedule view — instead of the server's UTC.
 */
export function fmtDateTimeTz(d: string | Date | null | undefined, tz?: string | null) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: tz || undefined,
  }).formatToParts(date);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('month')} ${g('day')}, ${g('year')} at ${g('hour')}:${g('minute')} ${g('dayPeriod')}`;
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
