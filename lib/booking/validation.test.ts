import { describe, it, expect } from 'vitest';
import { validDate, productDuration } from './validation';
import { calendarNeedsReconnect } from '../google-calendar/health';
describe('booking input validation', () => {
  it('rejects impossible or malformed dates', () => {
    expect(validDate('2026-02-30')).toBe(false);
    expect(validDate('2026-9-8')).toBe(false);
    expect(validDate('2028-02-29')).toBe(true);
  });
  it('requires every selected product to be eligible', () => {
    expect(()=>productDuration([{product_id:'missing',quantity:1}],[])).toThrow('invalid_product');
    expect(productDuration([{product_id:'p',quantity:2}],[{id:'p',duration_minutes:60}])).toBe(120);
  });
  it.each(['drone_photos_video', 'social_reel'])('uses the existing 60-minute estimate for standalone %s with no catalog duration', id => {
    expect(productDuration([{ product_id: id, quantity: 1 }], [{ id, duration_minutes: 0 }])).toBe(60);
  });
  it('keeps a nonzero combined service duration instead of adding a fallback for each zero-duration item', () => {
    expect(productDuration(
      [{ product_id: 'photos', quantity: 2 }, { product_id: 'reel', quantity: 1 }],
      [{ id: 'photos', duration_minutes: 60 }, { id: 'reel', duration_minutes: 0 }],
    )).toBe(120);
  });
  it('does not use the fallback for missing products or an empty selection', () => {
    expect(() => productDuration(
      [{ product_id: 'aerial', quantity: 1 }, { product_id: 'missing', quantity: 1 }],
      [{ id: 'aerial', duration_minutes: 0 }],
    )).toThrow('invalid_product');
    expect(() => productDuration([], [])).toThrow('invalid_duration');
  });
  it.each([10, 721])('continues to reject the invalid nonzero duration %i', duration_minutes => {
    expect(() => productDuration([{ product_id: 'p', quantity: 1 }], [{ id: 'p', duration_minutes }])).toThrow('invalid_duration');
  });
  it('flags insufficient or inactive calendar connections', () => {
    expect(calendarNeedsReconnect({is_active:true,scope:'https://www.googleapis.com/auth/calendar.events'})).toBe(true);
    expect(calendarNeedsReconnect({is_active:true,scope:'https://www.googleapis.com/auth/calendar.readonly'})).toBe(false);
    expect(calendarNeedsReconnect({is_active:false,scope:'https://www.googleapis.com/auth/calendar'})).toBe(true);
  });
});
