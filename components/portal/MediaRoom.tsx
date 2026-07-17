import { Video, Box, Map, Download, ExternalLink, FileText } from 'lucide-react';
import { isImageMime, isPdfMime, isVideoMime } from '@/lib/deliverables/embed';

export type DeliverableView = {
  id: string;
  kind: 'video' | 'tour_360' | 'floor_plan' | 'other';
  title: string | null;
  source: 'url' | 'file';
  url: string | null; // external_url, or a signed file URL
  embedUrl: string | null; // set when a URL is embeddable (YouTube/Vimeo/Matterport)
  mime: string | null;
  filename: string | null;
};

/** Client-facing "Media Room" — renders published video / 360 tour / floor-plan
 *  deliverables for a listing, each in the right viewer. Pure presentational
 *  (server-renderable); URLs are already resolved/signed by the caller. */
export function MediaRoom({ items }: { items: DeliverableView[] }) {
  const videos = items.filter((d) => d.kind === 'video');
  const tours = items.filter((d) => d.kind === 'tour_360');
  const plans = items.filter((d) => d.kind === 'floor_plan');
  const other = items.filter((d) => d.kind === 'other');
  if (items.length === 0) return null;

  return (
    <div className="mt-10 space-y-10">
      {videos.length > 0 && (
        <Section icon={Video} title={videos.length > 1 ? 'Videos' : 'Video'}>
          <div className="grid gap-6 md:grid-cols-2">
            {videos.map((d) => (
              <figure key={d.id}>
                <div className="overflow-hidden rounded-xl bg-black shadow-soft ring-1 ring-ink-100/60">
                  <div className="relative aspect-video">
                    {d.embedUrl ? (
                      <iframe
                        src={d.embedUrl}
                        title={d.title ?? 'Video'}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowFullScreen
                        className="absolute inset-0 h-full w-full"
                      />
                    ) : d.source === 'file' && d.url && isVideoMime(d.mime) ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={d.url} controls preload="metadata" className="absolute inset-0 h-full w-full bg-black object-contain" />
                    ) : (
                      <PlainLink url={d.url} label="Open video" />
                    )}
                  </div>
                </div>
                {d.title && <figcaption className="mt-2 text-sm text-slate-600">{d.title}</figcaption>}
              </figure>
            ))}
          </div>
        </Section>
      )}

      {tours.length > 0 && (
        <Section icon={Box} title={tours.length > 1 ? '360° Tours' : '360° Tour'}>
          <div className="space-y-6">
            {tours.map((d) => (
              <figure key={d.id}>
                <div className="overflow-hidden rounded-xl bg-ink-950 shadow-soft ring-1 ring-ink-100/60">
                  <div className="relative aspect-video">
                    {d.embedUrl ? (
                      <iframe
                        src={d.embedUrl}
                        title={d.title ?? '360 Tour'}
                        allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen"
                        allowFullScreen
                        className="absolute inset-0 h-full w-full"
                      />
                    ) : (
                      <PlainLink url={d.url} label="Open the tour" />
                    )}
                  </div>
                </div>
                {d.title && <figcaption className="mt-2 text-sm text-slate-600">{d.title}</figcaption>}
              </figure>
            ))}
          </div>
        </Section>
      )}

      {plans.length > 0 && (
        <Section icon={Map} title={plans.length > 1 ? 'Floor plans' : 'Floor plan'}>
          <div className="grid gap-6 sm:grid-cols-2">
            {plans.map((d) => (
              <figure key={d.id} className="card overflow-hidden">
                {d.url && isImageMime(d.mime) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.url} alt={d.title ?? 'Floor plan'} className="w-full bg-white object-contain" />
                ) : d.url && isPdfMime(d.mime) ? (
                  <div className="aspect-[4/3] bg-slate-100">
                    <iframe src={d.url} title={d.title ?? 'Floor plan'} className="h-full w-full" />
                  </div>
                ) : (
                  <div className="p-8"><PlainLink url={d.url} label="Open floor plan" /></div>
                )}
                <figcaption className="flex items-center justify-between gap-2 border-t border-slate-100 p-3 text-sm">
                  <span className="truncate text-slate-600">{d.title || 'Floor plan'}</span>
                  {d.url && (
                    <a href={d.url} download={d.filename ?? undefined} className="inline-flex shrink-0 items-center gap-1 text-ocean-700 hover:underline">
                      <Download className="h-4 w-4" /> Download
                    </a>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      )}

      {other.length > 0 && (
        <Section icon={FileText} title="More">
          <ul className="space-y-2">
            {other.map((d) => (
              <li key={d.id}>
                <a href={d.url ?? '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-ocean-700 hover:underline">
                  <ExternalLink className="h-4 w-4" /> {d.title || d.filename || 'Open'}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-ocean-950">
        <Icon className="h-5 w-5 text-ocean-600" /> {title}
      </h2>
      {children}
    </section>
  );
}

function PlainLink({ url, label }: { url: string | null; label: string }) {
  if (!url) return <div className="grid h-full w-full place-items-center text-sm text-slate-400">Unavailable</div>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="grid h-full w-full place-items-center gap-2 text-white">
      <ExternalLink className="h-6 w-6" />
      <span className="text-sm font-medium">{label}</span>
    </a>
  );
}
