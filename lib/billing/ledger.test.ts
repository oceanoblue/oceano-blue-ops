import { expect,it } from 'vitest';
import { balance, billingSummary, invoiceStatus, periodReport, csvCell, type InvoiceOrder } from './ledger';
import { reportPeriod } from './period';
const order=(changes:Partial<InvoiceOrder>={}):InvoiceOrder=>({id:'order',order_number:1,client_id:'client',listing_id:'listing',status:'delivered',created_at:'2026-09-10T12:00:00Z',total_cents:25000,download_paid_at:null,download_paid_cents:null,invoice_due_date:'2026-09-20',clients:{full_name:'Test client'},listings:{address_line1:'Test property'},order_items:[{description:'Photos',quantity:1,total_cents:22000,product_id:'photo'}],...changes});
it('marks overdue only after an explicit due date and excludes drafts, cancelled and paid balances',()=>{
 expect(invoiceStatus(order(),'2026-09-20')).toBe('Unpaid');expect(invoiceStatus(order(),'2026-09-21')).toBe('Overdue');expect(invoiceStatus(order({invoice_due_date:null}),'2026-09-21')).toBe('Unpaid');
 for(const changes of [{status:'draft'},{status:'cancelled'},{download_paid_at:'2026-09-01'}])expect(balance(order(changes))).toBe(0);
 expect(billingSummary([order(),order({status:'cancelled'}),order({total_cents:null})],'2026-09-21')).toEqual({outstanding:25000,overdue:25000,unpriced:1});
});
it('separates bookings by creation date from payments by capture date without guessing missing amounts',()=>{
 const orders=[order(),order({id:'older',created_at:'2026-08-01T12:00:00Z',download_paid_at:'2026-09-05T12:00:00Z',download_paid_cents:20000}),order({id:'unknown',created_at:'2026-08-01T12:00:00Z',download_paid_at:'2026-09-06T12:00:00Z'}),order({id:'cancelled',status:'cancelled'}),order({id:'futurepayment',created_at:'2026-08-01T12:00:00Z',download_paid_at:'2026-10-01T04:00:00Z',download_paid_cents:10000})];
 const p=reportPeriod('2026-09');const r=periodReport(orders,p.start,p.end);
 expect(r).toMatchObject({booked:25000,collected:20000,orders:1,payments:2,missingPayments:1});expect(r.clients[0]).toMatchObject({booked:25000,collected:20000});expect(r.products[0]).toMatchObject({booked:22000,quantity:1});
});
it('uses Eastern month boundaries across daylight saving and year end',()=>{
 expect(reportPeriod('2026-03')).toEqual({month:'2026-03',start:'2026-03-01T05:00:00.000Z',end:'2026-04-01T04:00:00.000Z'});
 expect(reportPeriod('2026-12').end).toBe('2027-01-01T05:00:00.000Z');
});
it('escapes CSV fields and neutralizes spreadsheet formulas from names',()=>{
 expect(csvCell('Hello,"world"')).toBe('"Hello,""world"""');expect(csvCell(' =SUM(A1)')).toBe('"\' =SUM(A1)"');expect(csvCell(null)).toBe('""');
});
