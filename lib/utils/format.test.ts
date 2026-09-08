import { describe, it, expect } from 'vitest';
import { fmtDate, fmtDateTime, fmtDateTimeTz, fmtTime, fmtDayLong } from './format';

// 2026-09-07 23:35:05 UTC is 7:35 PM Eastern (EDT). Vercel's server clock is
// UTC, so these must NOT depend on process TZ.
const utc = '2026-09-07T23:35:05.416Z';

describe('date formatting is Eastern, not the server clock', () => {
  it('fmtDateTime', () => {
    expect(fmtDateTime(utc)).toBe('Sep 7, 2026 at 7:35 PM');
  });
  it('fmtDate keeps the Eastern day near midnight UTC', () => {
    // 01:30 UTC on the 8th is still 9:30 PM on the 7th in Eastern.
    expect(fmtDate('2026-09-08T01:30:00Z')).toBe('Sep 7, 2026');
  });
  it('a date-only value stays on its own calendar day', () => {
    expect(fmtDate('2026-09-10')).toBe('Sep 10, 2026');
    expect(fmtDayLong('2026-09-10')).toBe('Thursday, Sep 10, 2026');
  });
  it('fmtTime / fmtDayLong', () => {
    expect(fmtTime(utc)).toBe('7:35 PM');
    expect(fmtDayLong(utc)).toBe('Monday, Sep 7, 2026');
  });
  it('fmtDateTimeTz honours an explicit zone', () => {
    expect(fmtDateTimeTz(utc, 'America/Los_Angeles')).toBe('Sep 7, 2026 at 4:35 PM');
  });
  it('empty input', () => {
    expect(fmtDateTime(null)).toBe('—');
  });
});
