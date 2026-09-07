import { describe, it, expect } from 'vitest';
import { sameEvent } from './sync-shoot';
import type { ExistingEvent, EventPayload } from './api';

const existing: ExistingEvent = {
  id: 'evt1',
  status: 'confirmed',
  summary: 'Karen · 478 Wiry Green Leaf Lane',
  description: 'Client: Jane\nShooter: Karen McDonnell (contractor)\nBooked via Oceano Blue Ops',
  location: '478 Wiry Green Leaf Lane, Bluffton, SC, 29909',
  // Google echoes times back in the event's zone, not UTC.
  startIso: '2026-09-09T14:00:00-04:00',
  endIso: '2026-09-09T15:00:00-04:00',
  transparency: 'transparent',
  attendeeEmails: ['karenmcdonnell24@gmail.com'],
};

const payload: EventPayload = {
  summary: 'Karen · 478 Wiry Green Leaf Lane',
  description: 'Client: Jane\nShooter: Karen McDonnell (contractor)\nBooked via Oceano Blue Ops',
  location: '478 Wiry Green Leaf Lane, Bluffton, SC, 29909',
  startIso: '2026-09-09T18:00:00.000Z',
  endIso: '2026-09-09T19:00:00.000Z',
  timezone: 'America/New_York',
  transparency: 'transparent',
  attendeeEmails: ['Karenmcdonnell24@gmail.com'],
};

describe('sameEvent', () => {
  it('treats an identical event as unchanged (same instant, any offset / email case)', () => {
    expect(sameEvent(existing, payload)).toBe(true);
  });

  it('detects a reschedule', () => {
    expect(sameEvent(existing, { ...payload, startIso: '2026-09-09T19:00:00.000Z' })).toBe(false);
  });

  it('detects a guest change (reassignment)', () => {
    expect(sameEvent(existing, { ...payload, attendeeEmails: [] })).toBe(false);
    expect(sameEvent(existing, { ...payload, attendeeEmails: ['someone@else.com'] })).toBe(false);
  });

  it('detects a retitle or free/busy flip', () => {
    expect(sameEvent(existing, { ...payload, summary: 'Gustavo · 478 Wiry Green Leaf Lane' })).toBe(false);
    expect(sameEvent(existing, { ...payload, transparency: 'opaque' })).toBe(false);
  });

  it('never matches a cancelled event (so it gets recreated)', () => {
    expect(sameEvent({ ...existing, status: 'cancelled' }, payload)).toBe(false);
  });
});
