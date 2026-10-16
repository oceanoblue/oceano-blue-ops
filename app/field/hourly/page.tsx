import { redirect } from 'next/navigation';
import { workActor } from '@/lib/contractor-work/server';
import { PortalHero } from '@/components/portal/PortalHero';
import { FieldNav } from '@/components/field/FieldNav';
import { HourlyWorkspace } from '@/components/contractors/HourlyWorkspace';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const actor = await workActor().catch(() => null);
  if (!actor || (!actor.admin && !actor.contractorActive)) redirect('/field');
  return <div className="min-h-screen bg-slate-50"><PortalHero eyebrow="Contractor portal" title="Hourly work" subtitle="Your event assignments, agreed rates and hours."><FieldNav/></PortalHero><main className="mx-auto max-w-5xl px-4 py-6 sm:px-6"><HourlyWorkspace/></main></div>;
}
