import { redirect } from 'next/navigation';
import { workActor } from '@/lib/contractor-work/server';
import { PortalHero } from '@/components/portal/PortalHero';
import { FieldNav } from '@/components/field/FieldNav';
import { VideoIntakeWorkspace } from '@/components/contractors/VideoIntakeWorkspace';
export const dynamic='force-dynamic';
export default async function Page(){try{await workActor();}catch{redirect('/field');}return <div className="min-h-screen bg-slate-50"><PortalHero eyebrow="Contractor portal" title="Video handoffs" subtitle="Original footage, audio and camera-card delivery."><FieldNav/></PortalHero><main className="mx-auto max-w-7xl px-4 py-6 sm:px-6"><VideoIntakeWorkspace/></main></div>;}
