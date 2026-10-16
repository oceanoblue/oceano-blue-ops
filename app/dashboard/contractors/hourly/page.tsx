import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock } from 'lucide-react';
import { workActor } from '@/lib/contractor-work/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { HourlyWorkspace } from '@/components/contractors/HourlyWorkspace';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const actor = await workActor().catch(() => null);
  if (!actor) redirect('/login');
  if (!actor.admin) redirect('/field/hourly');
  return <div className="space-y-6"><PageHeader eyebrow="Contractors" title="Hourly work" subtitle="Event and production assignments, time approval and payment history." icon={Clock}/><Link className="btn-secondary inline-flex" href="/dashboard/contractors">Contractor roster</Link><HourlyWorkspace/></div>;
}
