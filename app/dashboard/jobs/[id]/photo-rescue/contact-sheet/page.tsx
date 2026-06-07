import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { signThumbnails } from '@/lib/photos/thumbnails-server';
import { sceneBadgeClass } from '@/lib/photos/scene';

export const dynamic = 'force-dynamic';

/** Whole-job contact sheet: every photo as a thumbnail with scene tag. */
export default async function ContactSheetPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title')
    .eq('id', params.id)
    .maybeSingle();
  if (!job) notFound();
  const j = job as any;

  const { data: assetsData } = await supabase
    .from('assets')
    .select('id, filename, status, thumbnail_url, metadata, captured_at')
    .eq('job_id', params.id)
    .order('filename', { ascending: true })
    .limit(2000);

  const assets = assetsData ?? [];
  const thumbs = await signThumbnails(supabase, assets.map((a: any) => a.thumbnail_url));

  const withThumbs = assets.filter((a: any) => a.thumbnail_url).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/jobs/${j.id}/photo-rescue`} className="inline-flex items-center gap-1 text-sm text-ocean-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to rescue
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-ocean-950">Contact sheet</h1>
        <p className="text-sm text-slate-600">
          {j.title} · {assets.length} photos · {withThumbs} with previews
        </p>
      </div>

      {assets.length === 0 ? (
        <div className="card p-6 text-sm text-slate-500">No photos ingested yet.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {assets.map((a: any) => {
            const url = a.thumbnail_url ? thumbs[a.thumbnail_url] : null;
            const scene = a.metadata?.scene as string | undefined;
            return (
              <div key={a.id} className="card overflow-hidden">
                <div className="relative aspect-[3/2] bg-slate-100">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={a.filename} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-slate-300">
                      <Camera className="h-6 w-6" />
                    </div>
                  )}
                  {scene && scene !== 'unknown' && (
                    <span className={`pill absolute left-1 top-1 ${sceneBadgeClass(scene)} capitalize`}>{scene}</span>
                  )}
                  {a.status === 'rejected' && (
                    <span className="pill absolute right-1 top-1 bg-rose-100 text-rose-700">rejected</span>
                  )}
                </div>
                <div className="truncate px-2 py-1 text-[11px] text-slate-600">{a.filename}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
