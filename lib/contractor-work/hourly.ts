import { z } from 'zod';

export const HOURLY_LABELS = {
  assigned: 'Assigned', submitted: 'Awaiting approval', approved: 'Approved · unpaid',
  paid: 'Paid', cancelled: 'Cancelled',
} as const;
export type HourlyStatus = keyof typeof HOURLY_LABELS;
export interface HourlyAssignment {
  id: string; contractor_id: string; title: string; event_type: string; role: string;
  location: string; event_date: string; rate_cents: number; estimated_minutes: number;
  actual_minutes: number | null; approved_minutes: number | null; amount_cents: number | null;
  status: HourlyStatus; version: number; instructions: string; time_note: string;
  review_note: string; paid_note: string; paid_at: string | null; updated_at: string;
  contractors?: { full_name: string; payout_method?: string | null; payout_details?: string | null } | null;
}
export interface HourlyEvent {
  id: string; kind: string; created_at: string;
  details: { before: HourlyAssignment | null; after: HourlyAssignment };
}

const id = z.string().uuid();
const minutes = z.number().int().min(1).max(1440);
const note = z.string().trim().max(2000);
const fields = {
  title: z.string().trim().min(2).max(180), event_type: z.string().trim().min(2).max(100),
  role: z.string().trim().min(2).max(100), location: z.string().trim().max(250),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
    const d = new Date(v); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Choose a valid event date.'),
  rate_cents: z.number().int().min(1).max(1000000), estimated_minutes: minutes,
  instructions: z.string().trim().max(4000),
};
const identity = { id, version: z.number().int().min(1) };
export const hourlyActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), id, contractor_id: id, ...fields }).strict(),
  z.object({ action: z.literal('edit'), ...identity, ...fields }).strict(),
  z.object({ action: z.literal('submit'), ...identity, actual_minutes: minutes, note }).strict(),
  z.object({ action: z.literal('approve'), ...identity, approved_minutes: minutes, note }).strict(),
  z.object({ action: z.literal('return'), ...identity, note: note.min(3) }).strict(),
  z.object({ action: z.literal('cancel'), ...identity, note: note.min(3) }).strict(),
  z.object({ action: z.literal('pay'), ...identity, note: note.min(3) }).strict(),
]);
export function hourlyMoney(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
export function hourlyAmount(rateCents: number, minutes: number) {
  return Math.round(rateCents * minutes / 60);
}
export function hoursLabel(minutes: number) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
// Accept decimal hours while storing exact whole minutes, not floating pay totals.
export function hoursToMinutes(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return NaN;
  return Math.round(Number(value) * 60);
}
