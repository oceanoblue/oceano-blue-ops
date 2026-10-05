import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createAdminClient } from '@/lib/supabase/server';
import { performance,reportDays } from '@/lib/marketing/report';
import { PropertyPerformance } from '@/components/marketing/PropertyPerformance';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{days?:string}>}){
 const gate=await requireTeamMember();if(gate.error)notFound();const {id}=await params;
 const data=await performance(createAdminClient(),id,reportDays((await searchParams).days));
 return <div className="space-y-6"><Link className="text-sm underline" href={`/dashboard/orders/${id}/website`}>← Property marketing</Link><PropertyPerformance data={data} path={`/dashboard/orders/${id}/website/analytics`}/></div>;
}
