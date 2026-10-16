import { describe, expect, it, vi } from 'vitest';
import { allPaymentRows, paymentLines, photoPaymentLine, type PhotoPayment, type HourlyPayment } from './payment-ledger';
import { fmtDate } from '@/lib/utils/format';

const photo: PhotoPayment = {
  id: 'p1', contractor_id: 'c1', order_number: 80, status: 'delivered',
  pay_status: 'unpaid', pay_amount_cents: 6000, scheduled_at: '2026-10-13T16:30:00Z',
  pay_request_id: null, listings: { address_line1: '398 Canterbury Court' }, pay_requests: null,
};
const event: HourlyPayment = {
  id: 'h1', contractor_id: 'c2', title: 'Chamber reception', event_type: 'Event video',
  location: 'Bluffton', event_date: '2026-10-15', status: 'approved', amount_cents: 18000,
  paid_at: null, paid_note: null,
};

describe('contractor payment reconciliation', () => {
  it('only counts eligible unpaid work and keeps paid history separate', () => {
    const lines = paymentLines([
      photo,
      { ...photo, id: 'paid', pay_status: 'paid' },
      { ...photo, id: 'future', status: 'scheduled' },
      { ...photo, id: 'cancelled', status: 'cancelled' },
    ], [event, { ...event, id: 'unapproved', status: 'submitted' }, { ...event, id: 'cancelled', status: 'cancelled' }]);
    expect(lines.map(i => i.id)).toEqual(['hourly-h1', 'photo-p1', 'photo-paid']);
    expect(lines.filter(i => i.status === 'unpaid').reduce((sum, i) => sum + (i.amountCents ?? 0), 0)).toBe(24000);
    expect(lines.filter(i => i.contractorId === 'c1')).toHaveLength(2);
    expect(lines.find(i => i.id === 'hourly-h1')).toMatchObject({ title: 'Chamber reception', description: 'Event video · Bluffton', date: '2026-10-15' });
    expect(fmtDate(event.event_date)).toBe('Oct 15, 2026');
  });

  it('uses recorded contractor payment evidence and does not invent missing dates or amounts', () => {
    const lines = paymentLines([
      { ...photo, pay_status: 'paid', pay_request_id: 'r1', pay_requests: { paid_at: '2026-10-16T18:00:00Z', paid_note: 'Check 102' } },
      { ...photo, id: 'legacy', pay_status: 'paid', scheduled_at: null, pay_amount_cents: null, listings: null },
    ], [{ ...event, status: 'paid', paid_at: '2026-10-16T18:00:00Z', paid_note: 'Zelle 123' }]);
    expect(lines.find(i => i.id === 'photo-p1')).toMatchObject({ title: '398 Canterbury Court', paidNote: 'Check 102', requestId: 'r1' });
    expect(lines.find(i => i.id === 'photo-legacy')).toMatchObject({ title: 'Order #80', date: null, paidAt: null, paidNote: null, amountCents: null });
    expect(lines.find(i => i.id === 'hourly-h1')).toMatchObject({ status: 'paid', paidNote: 'Zelle 123' });
  });

  it('can itemize exact request membership even if a claimed shoot changes workflow status', () => {
    const claimed = { ...photo, status: 'cancelled', pay_request_id: 'r1' };
    expect(paymentLines([claimed], [])).toEqual([]);
    expect(photoPaymentLine(claimed)).toMatchObject({ requestId: 'r1', title: '398 Canterbury Court', amountCents: 6000 });
  });

  it('loads beyond the API row cap without dropping older unpaid shoots', async () => {
    const rows = Array.from({ length: 1001 }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
    expect(await allPaymentRows(fetchPage)).toEqual({ data: rows, error: null });
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('discards partial results when a later page fails', async () => {
    const error = { message: 'Database unavailable' };
    const result = await allPaymentRows(async from => from === 0
      ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }
      : { data: null, error });
    expect(result).toEqual({ data: null, error });
  });
});
