import { createClient } from '@/lib/supabase/server';
import type { InvoiceOrder } from './ledger';
export const invoiceSelect = 'id,order_number,client_id,listing_id,status,created_at,total_cents,download_paid_at,download_paid_cents,invoice_due_date,clients(full_name,email),listings(address_line1),order_items(description,quantity,total_cents,product_id)';
export async function loadInvoices(clientIds?: string[]) {
  if (clientIds && !clientIds.length) return [];
  const db = await createClient() as any;
  const rows: InvoiceOrder[] = [];
  for (let offset=0; ; offset+=500) {
    let query = db.from('orders').select(invoiceSelect).order('id').range(offset,offset+499);
    if (clientIds) query = query.in('client_id',clientIds);
    const { data, error } = await query;
    if (error || !data) throw new Error('Invoices could not be loaded. Please refresh.');
    rows.push(...data);
    if (data.length<500) return rows.sort((a,b)=>b.created_at.localeCompare(a.created_at));
  }
}
