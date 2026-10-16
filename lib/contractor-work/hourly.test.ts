import { describe, it, expect } from 'vitest';
import { hourlyActionSchema, hourlyAmount, hoursToMinutes } from './hourly';
const id = '11111111-1111-4111-8111-111111111111';
describe('hourly inputs and money', () => {
  it('converts fractional hours to whole minutes', () => { expect(hoursToMinutes('4.5')).toBe(270); expect(hoursToMinutes('0.25')).toBe(15); expect(hoursToMinutes('0.02')).toBe(1); });
  it('rejects empty, negative and exponential hour strings', () => { for (const input of ['', '-1', '1e2', 'abc']) expect(Number.isNaN(hoursToMinutes(input))).toBe(true); });
  it('calculates and rounds cents', () => { expect(hourlyAmount(7500, 270)).toBe(33750); expect(hourlyAmount(6001, 1)).toBe(100); });
  it('rejects injected rate changes or actor impersonation in time submission', () => { expect(hourlyActionSchema.safeParse({ action: 'submit', id, version: 1, actual_minutes: 60, note: '', rate_cents: 1 }).success).toBe(false); expect(hourlyActionSchema.safeParse({ action: 'submit', id, version: 1, actual_minutes: 60, note: '', actor: id }).success).toBe(false); });
  it('rejects zero, excessive, and non-integer minutes', () => { for (const actual_minutes of [0, 1441, -1, 2.5]) expect(hourlyActionSchema.safeParse({ action: 'submit', id, version: 1, actual_minutes, note: '' }).success).toBe(false); });
  it('requires an explanation when recording payment or returning work', () => { for (const action of ['pay', 'return', 'cancel']) expect(hourlyActionSchema.safeParse({ action, id, version: 1, note: '' }).success).toBe(false); });
  it('allows rates outside $60–100 and rejects impossible dates', () => { const value = { action: 'create', id, contractor_id: id, title: 'Event', event_type: 'Corporate', role: 'Video', location: '', event_date: '2026-10-16', rate_cents: 15000, estimated_minutes: 240, instructions: '' }; expect(hourlyActionSchema.safeParse(value).success).toBe(true); expect(hourlyActionSchema.safeParse({ ...value, event_date: '2026-02-30' }).success).toBe(false); });
});
