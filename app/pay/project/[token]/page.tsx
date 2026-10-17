import { notFound } from 'next/navigation';
import { publicProjectBill } from '@/lib/crm/billing-server';
import { BillingPayment } from '@/components/crm/BillingPayment';
export const dynamic='force-dynamic';
export const metadata={title:'Secure project payment · Oceano Blue',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{token:string}>}){const{token}=await params;const bill=await publicProjectBill(token);if(!bill)notFound();return <BillingPayment bill={bill} token={token} production={process.env.VERCEL_ENV==='production'}/>;}
