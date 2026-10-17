import type Stripe from 'stripe';
import {getStripe} from '@/lib/stripe/server';
import {billingAdjustmentTypes} from './billing-adjustments';
import {crmDb,CrmError} from './server';
export const requiredBillingEvents=['checkout.session.completed','checkout.session.async_payment_succeeded',...billingAdjustmentTypes] as const;
const options={timeout:15000,maxNetworkRetries:0};
function canonical(endpoint:Stripe.WebhookEndpoint){try{const u=new URL(endpoint.url);return u.origin==='https://app.oceanoblue.net'&&u.pathname.replace(/\/$/,'')==='/api/stripe/webhook'&&!u.search&&!u.hash&&!u.username&&!u.password;}catch{return false;}}
async function admin(actor:string){const{data,error}=await crmDb().from('team_members').select('role,is_active').eq('id',actor).maybeSingle();if(error)throw new CrmError('Office access could not be checked.',503);return data?.is_active===true&&data.role==='admin';}
export async function billingHealth(actor:string){
 const canUpdate=process.env.VERCEL_ENV==='production'&&await admin(actor),stripe=getStripe();
 const base={reason:undefined as string|undefined,configured:!!stripe,webhookSigningConfigured:!!process.env.STRIPE_WEBHOOK_SECRET,connectionHealthy:false,canonicalEndpointEnabled:false,subscriptionsVerified:false,subscribedEvents:[] as string[],missingEvents:[...requiredBillingEvents] as string[],canUpdateSubscriptions:false};
 if(process.env.VERCEL_ENV!=='production'||!stripe)return{...base,reason:process.env.VERCEL_ENV==='production'?'not_configured':'production_only'};
 try{
  const[account,balance,endpoints]=await Promise.all([stripe.accounts.retrieve({},options),stripe.balance.retrieve({},options),stripe.webhookEndpoints.list({limit:100},options)]);
  const relevant=endpoints.data.filter(e=>canonical(e)&&e.status==='enabled'&&e.livemode);
  // Each enabled canonical endpoint must receive all events. A split union could
  // hide a stale endpoint that fails delivery or has the wrong signing secret.
  const subscribed=requiredBillingEvents.filter(type=>relevant.length>0&&relevant.every(e=>e.enabled_events.includes('*')||e.enabled_events.includes(type)));
  return{...base,connectionHealthy:!('deleted'in account)&&balance.livemode===true,canonicalEndpointEnabled:relevant.length>0,subscriptionsVerified:!endpoints.has_more,subscribedEvents:subscribed,missingEvents:requiredBillingEvents.filter(e=>!subscribed.includes(e)),canUpdateSubscriptions:canUpdate&&!endpoints.has_more&&relevant.length>0};
 }catch{return{...base,reason:'provider_check_failed'};}
}
/** Explicit office action: preserve endpoint identity, URL, status and existing
 * events. This never creates a webhook, rotates secrets or touches payments. */
export async function subscribeBillingEvents(actor:string){
 if(process.env.VERCEL_ENV!=='production')throw new CrmError('Open production Ops to update Stripe subscriptions.',403);
 if(!await admin(actor))throw new CrmError('Administrator access is required.',403);
 const stripe=getStripe();if(!stripe)throw new CrmError('Stripe is not configured.',503);
 try{
  const endpoints=await stripe.webhookEndpoints.list({limit:100},options);
  if(endpoints.has_more)throw new Error('Incomplete endpoint list');
  const relevant=endpoints.data.filter(e=>canonical(e)&&e.status==='enabled'&&e.livemode);
  if(!relevant.length)throw new Error('Canonical endpoint unavailable');
  for(const e of relevant){if(e.enabled_events.includes('*'))continue;const enabled_events=[...new Set([...e.enabled_events,...requiredBillingEvents])] as Stripe.WebhookEndpointUpdateParams.EnabledEvent[];if(enabled_events.length!==e.enabled_events.length)await stripe.webhookEndpoints.update(e.id,{enabled_events},options);}
 }catch{throw new CrmError('Stripe subscriptions could not be fully verified. Run the connection check before retrying.',503);}
 return billingHealth(actor);
}
