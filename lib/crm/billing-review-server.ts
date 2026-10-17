import type Stripe from 'stripe';
import {crmDb,CrmError} from './server';
import {getStripe} from '@/lib/stripe/server';
/** Read only provider evidence. Never refunds, captures or charges a payment. */
export async function inspectBillingReview(id:string){
 const db=crmDb();const{data:checkout,error}=await db.from('crm_billing_checkouts').select('*').eq('id',id).maybeSingle();
 if(error)throw new CrmError('Payment review is unavailable.',503);if(!checkout||checkout.status!=='review')throw new CrmError('This payment review changed. Reload the ledger.',409);
 const[{data:invoice,error:invoiceError},{data:installment,error:installmentError}]=await Promise.all([
 db.from('crm_billing_invoices').select('id,title,currency,project_id,source_id,source_system,total_cents,source_paid_cents,version,collection_enabled').eq('id',checkout.invoice_id).maybeSingle(),
 db.from('crm_billing_installments').select('id,title,amount_cents,paid_cents').eq('id',checkout.installment_id).maybeSingle(),]);
 if(invoiceError||installmentError||!invoice||!installment)throw new CrmError('The invoice could not be verified.',503);
 const stripe=getStripe(),sessionId=checkout.review_session_id||checkout.stripe_session_id;
 if(!stripe||!sessionId)throw new CrmError('The exact Stripe session must be identified before resolving this payment.',409);
 const session=await stripe.checkout.sessions.retrieve(sessionId,{expand:['payment_intent.latest_charge']},{timeout:15000,maxNetworkRetries:0});
 const intent=typeof session.payment_intent==='object'&&session.payment_intent?session.payment_intent as Stripe.PaymentIntent:null;
 const charge=intent&&typeof intent.latest_charge==='object'&&intent.latest_charge?intent.latest_charge as Stripe.Charge:null;
 const amount=session.amount_total,refunded=charge?.amount_refunded??null;
 const refunds=charge?await stripe.refunds.list({charge:charge.id,limit:100},{timeout:15000,maxNetworkRetries:0}):null;
 const refundsVerified=!!refunds&&!refunds.has_more&&refunds.data.every(r=>r.charge===charge?.id&&r.currency===charge?.currency&&!['pending','requires_action'].includes(r.status??'pending'))&&refunds.data.filter(r=>r.status==='succeeded').reduce((n,r)=>n+r.amount,0)===refunded;

 const identity=session.id===sessionId&&session.metadata?.crm_billing_checkout_id===checkout.id&&intent&&charge&&charge.payment_intent===intent.id;
 const verified=!!identity&&session.mode==='payment'&&session.payment_status==='paid'&&intent?.status==='succeeded'&&charge?.status==='succeeded'&&charge.paid&&charge.captured&&charge.amount_captured===amount&&!charge.disputed&&refundsVerified&&session.livemode===true&&intent.livemode===true&&charge.livemode===true&&Number.isSafeInteger(amount)&&!!amount&&charge.amount===amount&&intent.amount_received===amount&&charge.currency===session.currency&&intent.currency===session.currency&&Number.isSafeInteger(refunded)&&refunded!==null&&refunded>=0&&refunded<=amount;
 const remaining=installment.amount_cents-installment.paid_cents,net=typeof amount==='number'&&typeof refunded==='number'?amount-refunded:null;
 const evidence={session_id:session.id,checkout_id:session.metadata?.crm_billing_checkout_id??'',mode:session.mode,payment_status:session.payment_status,intent_status:intent?.status??'',charge_status:charge?.status??'',charge_paid:charge?.paid??false,charge_captured:charge?.captured??false,charge_disputed:charge?.disputed??false,refunds_verified:refundsVerified,refunds:(refunds?.data??[]).map(r=>({id:r.id,amount:r.amount,status:r.status})),livemode:!!verified,amount_total:amount??-1,amount_refunded:refunded??-1,currency:session.currency??'',payment_intent_id:intent?.id??'',charge_id:charge?.id??'',provider_verified_at:new Date().toISOString()};
 return{checkout:{id:checkout.id,expected_cents:checkout.expected_cents,received_cents:checkout.received_cents,review_reason:checkout.review_reason,expected_session_id:checkout.stripe_session_id,review_session_id:sessionId},invoice,installment,provider:{verified:!!verified,session_id:session.id,payment_intent_id:intent?.id??'',charge_id:charge?.id??'',amount_total:amount,amount_refunded:refunded,net_paid_cents:net,currency:session.currency,livemode:session.livemode,paid:session.payment_status==='paid'},canCredit:!!verified&&!invoice.collection_enabled&&session.currency===invoice.currency&&net!==null&&net>0&&net===remaining,canConfirmRefund:!!verified&&!invoice.collection_enabled&&typeof amount==='number'&&refunded===amount,evidence};
}
export async function resolveBillingReview(actor:string,id:string,version:number,resolution:'credit'|'refund_verified',note:string){
 const inspected=await inspectBillingReview(id);
 if(version!==inspected.invoice.version)throw new CrmError('Record changed. Inspect the payment again.',409);
 if(resolution==='credit'?!inspected.canCredit:!inspected.canConfirmRefund)throw new CrmError('Stripe evidence does not support that resolution. Keep the payment held and check its charge/refund history.',409);
 const{data,error}=await crmDb().rpc('crm_billing_resolve_review',{p_actor:actor,p_id:id,p_invoice_version:version,p_resolution:resolution,p_note:note,p_evidence:inspected.evidence});
 if(error)throw new CrmError('Payment reconciliation could not be saved.',503);if(data?.error)throw new CrmError(data.error,data.error.includes('Record changed')?409:400);return data;
}
