import { expect, it } from 'vitest';
import {
  balance,
  matchesInvoiceFilter,
  outstandingInvoices,
  parseInvoiceFilter,
  type InvoiceOrder,
} from './ledger';

const order = (changes: Partial<InvoiceOrder> = {}): InvoiceOrder => ({
  id: 'order', order_number: 1, client_id: 'client', listing_id: 'listing',
  status: 'delivered', created_at: '2026-09-15T12:00:00Z', total_cents: 25000,
  download_paid_at: null, download_paid_cents: null, invoice_due_date: null,
  clients: { full_name: 'Test client' }, listings: { address_line1: 'Test property' },
  order_items: [], ...changes,
});

it('keeps delivered and archived unpaid orders visible until payment is recorded', () => {
  const delivered = order({ id: 'delivered' });
  const archived = { ...order({ id: 'archived', total_cents: 20000 }), archived_at: '2026-10-01T12:00:00Z' };
  const rows = outstandingInvoices([
    delivered,
    archived,
    order({ id: 'paid', download_paid_at: '2026-09-25T12:00:00Z', download_paid_cents: 25000 }),
    order({ id: 'draft', status: 'draft' }),
    order({ id: 'cancelled', status: 'cancelled' }),
    order({ id: 'unpriced', total_cents: null }),
    order({ id: 'free', total_cents: 0 }),
  ]);
  expect(rows.map(o => o.id).sort()).toEqual(['archived', 'delivered']);
  expect(rows.reduce((sum, o) => sum + balance(o), 0)).toBe(45000);
  expect(outstandingInvoices(rows.map(o => ({ ...o, download_paid_at: '2026-11-04T12:00:00Z' })))).toEqual([]);
});

it('prioritizes delivered balances before upcoming work, then due dates and age without mutating the source', () => {
  const rows = [
    order({ id: 'booked', status: 'booked', invoice_due_date: '2026-08-01' }),
    order({ id: 'newer', created_at: '2026-10-01T12:00:00Z' }),
    order({ id: 'older', created_at: '2026-08-01T12:00:00Z' }),
    order({ id: 'due', invoice_due_date: '2026-10-02' }),
  ];
  expect(outstandingInvoices(rows).map(o => o.id)).toEqual(['due', 'older', 'newer', 'booked']);
  expect(rows.map(o => o.id)).toEqual(['booked', 'newer', 'older', 'due']);
});

it('shows unpaid and overdue invoices together through the outstanding dashboard link', () => {
  const today = '2026-11-04';
  const unpaid = order();
  const overdue = order({ invoice_due_date: '2026-10-01' });
  const paid = order({ download_paid_at: '2026-11-01T12:00:00Z' });
  expect(matchesInvoiceFilter(unpaid, 'Outstanding', today)).toBe(true);
  expect(matchesInvoiceFilter(overdue, 'Outstanding', today)).toBe(true);
  expect(matchesInvoiceFilter(paid, 'Outstanding', today)).toBe(false);
  expect(matchesInvoiceFilter(overdue, 'Unpaid', today)).toBe(false);
  expect(matchesInvoiceFilter(overdue, 'Overdue', today)).toBe(true);
  expect(matchesInvoiceFilter(paid, 'Paid', today)).toBe(true);
  expect(parseInvoiceFilter('Outstanding')).toBe('Outstanding');
  expect(parseInvoiceFilter('bogus')).toBe('All');
  expect(parseInvoiceFilter(['Outstanding', 'Paid'])).toBe('All');
});
