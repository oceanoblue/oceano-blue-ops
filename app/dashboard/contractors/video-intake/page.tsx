import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FolderUp } from 'lucide-react';
import { workActor } from '@/lib/contractor-work/server';
import { PageHeader } from '@/components/ui/PageHeader';
import { VideoIntakeWorkspace } from '@/components/contractors/VideoIntakeWorkspace';
export const dynamic='force-dynamic';
export default async function Page(){const actor=await workActor().catch(()=>null);if(!actor)redirect('/login');if(!actor.admin)redirect('/field/video-intake');return <div className="space-y-6"><PageHeader eyebrow="Contractors" title="Upload requests" subtitle="Private Dropbox uploads for original photos, video, audio and camera cards." icon={FolderUp}/><div className="flex flex-wrap gap-3 text-sm"><Link className="btn-secondary" href="/dashboard/contractors">Contractor roster</Link><Link className="btn-secondary" href="/dashboard/contractors/agreements">Master agreements</Link></div><VideoIntakeWorkspace/></div>;}
