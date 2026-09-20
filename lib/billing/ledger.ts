export type InvoiceOrder = {
  id: string; order_number: number; client_id: string; listing_id: string; status: string;
  created_at: string; total_cents: number | null; download_paid_at: string | null; download_paid_cents: number | null; invoice_due_date: string | null;
  clients: { full_name: string; email?: string | null } | null;
  listings: { address_line1: string } | null;
  order_items: { description: string; quantity: number; total_cents: number; product_id: string | null }[];
};
export const money = (cents: number | null) => cents === null ? 'Not recorded' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export function invoiceStatus(o: InvoiceOrder, today: string) {
  if (o.download_paid_at) return 'Paid';
  if (o.status === 'cancelled') return 'Cancelled';
  if (o.status === 'draft') return 'Draft';
  if (o.total_cents === null) return 'Unpriced';
  if (o.total_cents <= 0) return 'No charge';
  return o.invoice_due_date && o.invoice_due_date < today ? 'Overdue' : 'Unpaid';
}
export function balance(o: InvoiceOrder) {
  return o.download_paid_at || ['draft', 'cancelled'].includes(o.status) ? 0 : Math.max(0, o.total_cents ?? 0);
}
export function billingSummary(orders: InvoiceOrder[], today: string) {
  return { outstanding: orders.reduce((n, o) => n + balance(o), 0), overdue: orders.filter(o => invoiceStatus(o, today) === 'Overdue').reduce((n, o) => n + balance(o), 0), unpriced: orders.filter(o => invoiceStatus(o,today) === 'Unpriced').length };
}
export function periodReport(orders: InvoiceOrder[], start: string, end: string) {
  const inside = (date: string) => Date.parse(date) >= Date.parse(start) && Date.parse(date) < Date.parse(end);
  const booked = orders.filter(o => !['draft','cancelled'].includes(o.status) && inside(o.created_at));
  const paid = orders.filter(o => o.download_paid_at && inside(o.download_paid_at));
  const clients = new Map<string, { name: string; booked: number; collected: number; missingPayments: number }>();
  const getClient = (o: InvoiceOrder) => {
    if (!clients.has(o.client_id)) clients.set(o.client_id, { name: o.clients?.full_name || 'Unknown client', booked: 0, collected: 0, missingPayments: 0 });
    return clients.get(o.client_id)!;
  };
  booked.forEach(o => { getClient(o).booked += o.total_cents ?? 0; });
  paid.forEach(o => { const c = getClient(o); c.collected += o.download_paid_cents ?? 0; if (o.download_paid_cents === null) c.missingPayments++; });
  const products = new Map<string, { name: string; quantity: number; booked: number }>();
  booked.forEach(o => o.order_items.forEach(item => {
    const key = item.product_id || item.description;
    if (!products.has(key)) products.set(key, { name: item.description, quantity: 0, booked: 0 });
    const p = products.get(key)!; p.quantity += item.quantity; p.booked += item.total_cents;
  }));
  return { booked: booked.reduce((n,o) => n+(o.total_cents??0),0), collected: paid.reduce((n,o) => n+(o.download_paid_cents??0),0),
    orders: booked.length, payments: paid.length, missingPrices: booked.filter(o=>o.total_cents===null).length, missingPayments: paid.filter(o=>o.download_paid_cents===null).length,
    clients: [...clients.values()].sort((a,b)=>b.collected-a.collected), products: [...products.values()].sort((a,b)=>b.booked-a.booked) };
}
export function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"','""') + '"';
}
