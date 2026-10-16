export const PAYABLE_STATUSES = ['uploaded', 'processing', 'editing', 'ready', 'delivered'];

export type PaymentLine = {
  id: string;
  contractorId: string;
  title: string;
  description: string;
  date: string | null;
  amountCents: number | null;
  status: 'unpaid' | 'paid';
  href: string;
  requestId: string | null;
  paidAt: string | null;
  paidNote: string | null;
};

export type PhotoPayment = {
  id: string; contractor_id: string; order_number: number; status: string;
  pay_status: string; pay_amount_cents: number | null; scheduled_at: string | null;
  pay_request_id: string | null;
  listings: { address_line1: string } | null;
  pay_requests: { paid_at: string | null; paid_note: string | null } | null;
};

export type HourlyPayment = {
  id: string; contractor_id: string; title: string; event_type: string;
  location: string; event_date: string; status: string; amount_cents: number | null;
  paid_at: string | null; paid_note: string | null;
};

export function photoPaymentLine(o: PhotoPayment): PaymentLine {
  return {
    id: `photo-${o.id}`, contractorId: o.contractor_id,
    title: o.listings?.address_line1 || `Order #${o.order_number}`,
    description: `Property shoot · #${o.order_number}`,
    date: o.scheduled_at, amountCents: o.pay_amount_cents,
    status: o.pay_status === 'paid' ? 'paid' : 'unpaid',
    href: `/dashboard/orders/${o.id}`, requestId: o.pay_request_id,
    paidAt: o.pay_status === 'paid' ? o.pay_requests?.paid_at ?? null : null,
    paidNote: o.pay_status === 'paid' ? o.pay_requests?.paid_note ?? null : null,
  };
}

export function paymentLines(orders: PhotoPayment[], hourly: HourlyPayment[]): PaymentLine[] {
  return [
    ...orders.filter(o => (PAYABLE_STATUSES.includes(o.status) && o.pay_status === 'unpaid') || o.pay_status === 'paid').map(photoPaymentLine),
    ...hourly.filter(h => h.status === 'approved' || h.status === 'paid').map((h): PaymentLine => ({
      id: `hourly-${h.id}`, contractorId: h.contractor_id, title: h.title,
      description: [h.event_type, h.location].filter(Boolean).join(' · '),
      date: h.event_date, amountCents: h.amount_cents,
      status: h.status === 'paid' ? 'paid' : 'unpaid',
      href: '/dashboard/contractors/hourly', requestId: null,
      paidAt: h.paid_at, paidNote: h.paid_note,
    })),
  ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
}

/** Read every page so older unpaid work cannot silently fall off the balance. */
export async function allPaymentRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < size) return { data: rows, error: null };
  }
}
