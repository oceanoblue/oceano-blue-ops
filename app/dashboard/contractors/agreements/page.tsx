import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileText } from 'lucide-react';
import { workActor } from '@/lib/contractor-work/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { AgreementsWorkspace } from '@/components/contractors/AgreementsWorkspace';
export const dynamic='force-dynamic';
export default async function Page(){const actor=await workActor().catch(()=>null);if(!actor)redirect('/login');if(!actor.admin)redirect('/field/agreements');return <div className="space-y-6"><PageHeader eyebrow="Contractors" title="Master agreements" subtitle="Prepare, review and collect intentional electronic signatures." icon={FileText}/><div className="flex flex-wrap gap-3 text-sm"><Link className="btn-secondary" href="/dashboard/contractors">Contractor roster</Link><Link className="btn-secondary" href="/dashboard/contractors/video-intake">Video handoffs</Link></div><AgreementsWorkspace/></div>;}
