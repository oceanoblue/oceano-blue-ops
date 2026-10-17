import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BillingPayment} from '@/components/crm/BillingPayment';
const bill={title:'Fixture invoice',project:'Fixture project',installment:'Final payment',amount_cents:10000,paid_cents:10000,due_date:'2027-01-01',due_date_verified:true,payable:false};
it('replaces the paid confirmation and zero balance with an adjustment review state',()=>{const html=renderToStaticMarkup(createElement(BillingPayment,{bill:{...bill,payment_review_required:true},token:'a'.repeat(64),production:true}));expect(html).toContain('Payment adjustment under review');expect(html).toContain('No payment is requested');expect(html).not.toContain('This installment is paid');expect(html).not.toContain('$0.00');expect(html).not.toContain('Pay securely');});
it('continues to show paid confirmation for a reconciled fully paid installment',()=>{expect(renderToStaticMarkup(createElement(BillingPayment,{bill,token:'a'.repeat(64),production:true}))).toContain('This installment is paid');});
