import { expect, it } from 'vitest';
import { scheduleInput, scheduleWindow } from './schedule-window';
const zone = 'America/New_York';
it('shows and shortens the 2–5:30 appointment in its own timezone', () => {
  expect(scheduleInput('2026-09-30T18:00:00Z', zone)).toBe('2026-09-30T14:00');
  expect(scheduleWindow('2026-09-30T14:00','2026-09-30T17:30',zone)).toEqual({scheduledAt:'2026-09-30T18:00:00.000Z',endsAt:'2026-09-30T21:30:00.000Z',duration:210});
  expect(scheduleWindow('2026-09-30T14:00','2026-09-30T15:30',zone).duration).toBe(90);
});
it('handles winter offsets, midnight, and overnight end dates', () => {
  expect(scheduleInput('2026-12-15T05:00:00Z',zone)).toBe('2026-12-15T00:00');
  expect(scheduleWindow('2026-12-15T23:00','2026-12-16T01:00',zone)).toEqual({scheduledAt:'2026-12-16T04:00:00.000Z',endsAt:'2026-12-16T06:00:00.000Z',duration:120});
});
it('rejects missing, impossible, reversed, and out-of-range windows', () => {
  for (const [from,to] of [['',''],['2026-02-30T14:00','2026-02-30T15:00'],['2026-09-30T14:00','2026-09-30T13:00'],['2026-09-30T14:00','2026-09-30T14:05'],['2026-09-30T00:00','2026-09-30T13:00']]) {
    expect(() => scheduleWindow(from,to,zone)).toThrow();
  }
});
it('rejects nonexistent spring-forward times and measures real elapsed time across DST', () => {
  expect(() => scheduleWindow('2026-03-08T02:30','2026-03-08T04:00',zone)).toThrow('daylight-saving');
  expect(scheduleWindow('2026-03-08T01:30','2026-03-08T03:30',zone).duration).toBe(60);
});
