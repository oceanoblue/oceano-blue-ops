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
  it('flags insufficient or inactive calendar connections', () => {
    expect(calendarNeedsReconnect({is_active:true,scope:'https://www.googleapis.com/auth/calendar.events'})).toBe(true);
    expect(calendarNeedsReconnect({is_active:true,scope:'https://www.googleapis.com/auth/calendar.readonly'})).toBe(false);
    expect(calendarNeedsReconnect({is_active:false,scope:'https://www.googleapis.com/auth/calendar'})).toBe(true);
  });
});
