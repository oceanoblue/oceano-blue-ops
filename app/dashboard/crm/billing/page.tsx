import { notFound } from 'next/navigation';
import { crmActor } from '@/lib/crm/server';
import { billingRead } from '@/lib/crm/billing-server';
import { BillingWorkspace } from '@/components/crm/BillingWorkspace';
export const dynamic='force-dynamic';
export default async function Page(){try{await crmActor();}catch{notFound();}const data=await billingRead().catch(()=>null);return <BillingWorkspace initialData={data}/>;}
