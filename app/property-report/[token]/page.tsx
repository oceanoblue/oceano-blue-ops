import { notFound } from 'next/navigation';
import { reportAccess,performance,reportDays } from '@/lib/marketing/report';
import { PropertyPerformance } from '@/components/marketing/PropertyPerformance';
export const dynamic='force-dynamic';
export const metadata={title:'Private property performance',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{days?:string}>}){
 const {token}=await params;const access=await reportAccess(token);if(!access)notFound();
 const data=await performance(access.db,access.orderId,reportDays((await searchParams).days));
 return <main className="min-h-screen bg-slate-50 p-5 sm:p-10"><div className="mx-auto max-w-7xl"><p className="mb-6 text-xs text-slate-500">Private report · Keep this link confidential. Anyone with it can view performance and inquiries.</p><PropertyPerformance data={data} path={`/property-report/${token}`}/></div></main>;
}
