import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { Download, Film, Check, Loader2, CircleDashed, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fmtRelative } from '@/lib/utils/format';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PortalHero } from '@/components/portal/PortalHero';
import { REEL_TYPES, ASPECTS } from '@/lib/reels/types';

export const dynamic = 'force-dynamic';

/** Player aspect-ratio class derived from the brief's stored "WIDTHxHEIGHT". */
const PLAYER_ASPECT: Record<string, string> = {
  '1080x1920': 'aspect-[9/16] max-h-[560px]',
  '1080x1080': 'aspect-square max-h-[560px]',
  '1920x1080': 'aspect-video',
};

/** Status → progress rank, so we can drive the delivery timeline + gate the
 *  finished reel. Clients only ever see the render once we mark it delivered. */
const STATUS_RANK: Record<string, number> = {
  draft: 0,
  booked: 1,
  uploaded: 1,
  processing: 2,
  editing: 2,
  ready: 3,
  delivered: 4,
};

function fmtBytes(n: number | null) {
  if (!n) return '—';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDur(s: number | null) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default async function ClientReelDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/portal');

  // RLS scopes this to the signed-in client's own orders — a foreign id 404s.
  const { data: order } = await supabase
    .from('orders')
    .select(
      `id, order_number, status, created_at, delivered_at, order_kind,
       reel_briefs(reel_type, aspect, subject_name, subject_title, length_target_s, captions, music, lower_third),
       order_footage(id, filename, byte_size, duration_seconds, role)`
    )
    .eq('id', params.id)
    .eq('order_kind', 'reel_edit')
    .maybeSingle();
  if (!order) notFound();

  const o = order as any;
  const brief = Array.isArray(o.reel_briefs) ? o.reel_briefs[0] : o.reel_briefs;
  const footage = (o.order_footage ?? []) as any[];
  const rank = STATUS_RANK[o.status] ?? 1;
  const isDelivered = o.status === 'delivered';
  const isCancelled = o.status === 'cancelled';

  // The finished reel is revealed only once the order is delivered (the team
  // reviews the render at the 'ready' gate first). Sign the latest done render.
  let reel: { url: string; filename: string; durationSeconds: number | null } | null = null;
  if (isDelivered) {
    const { data: ej } = await supabase
      .from('edit_jobs')
      .select('result_bucket, result_path, result_filename, result_duration_seconds')
      .eq('order_id', o.id)
      .eq('status', 'done')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ej?.result_bucket && ej.result_path) {
      const { data: signed } = await supabase.storage
        .from(ej.result_bucket)
        .createSignedUrl(ej.result_path, 3600, { download: ej.result_filename ?? true });
      if (signed?.signedUrl) {
        reel = {
          url: signed.signedUrl,
          filename: ej.result_filename ?? 'reel.mp4',
          durationSeconds: ej.result_duration_seconds ?? null,
        };
      }
    }
  }

  const reelLabel = REEL_TYPES.find((t) => t.value === brief?.reel_type)?.label ?? 'Reel';
  const aspectLabel = ASPECTS.find((a) => a.value === brief?.aspect)?.label ?? brief?.aspect ?? '—';
  const playerAspect = PLAYER_ASPECT[brief?.aspect] ?? 'aspect-[9/16] max-h-[560px]';

  const steps = [
    { label: 'Footage received', done: rank >= 1, active: rank === 1 },
    { label: 'Editing', done: rank >= 3, active: rank === 2 },
    { label: 'Final review', done: rank >= 4, active: rank === 3 },
    { label: 'Delivered', done: rank >= 4, active: false },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHero
        eyebrow="Reel"
        title={reelLabel}
        subtitle={
          <>
            {aspectLabel}
            {brief?.subject_name ? ` · ${brief.subject_name}` : ''} · #{o.order_number} · submitted{' '}
            {fmtRelative(o.created_at)}
          </>
        }
        backHref="/portal/reels"
        backLabel="All reels"
      >
        <StatusBadge status={o.status} />
        {reel && (
          <a
            href={reel.url}
            download={reel.filename}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-ink-900 shadow-soft transition hover:-translate-y-px hover:shadow-lift"
          >
            <Download className="h-4 w-4" /> Download reel
          </a>
        )}
      </PortalHero>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8 lg:grid-cols-3">
        {/* ── Main column: the finished reel, or its progress ───────────────── */}
        <div className="space-y-6 lg:col-span-2">
          {reel ? (
            <section className="card overflow-hidden p-0">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={reel.url}
                controls
                playsInline
                preload="metadata"
                className={`w-full bg-black object-contain ${playerAspect}`}
              />
              <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ocean-950">{reel.filename}</div>
                  <div className="text-xs text-slate-500">
                    {aspectLabel}
                    {fmtDur(reel.durationSeconds) ? ` · ${fmtDur(reel.durationSeconds)}` : ''}
                  </div>
                </div>
                <a
                  href={reel.url}
                  download={reel.filename}
                  className="btn-primary inline-flex shrink-0 items-center gap-1.5"
                >
                  <Download className="h-4 w-4" /> Download
                </a>
              </div>
            </section>
          ) : (
            <section className="card p-8 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ocean-100 text-ocean-700">
                {isCancelled ? <XCircle className="h-7 w-7" /> : <Film className="h-7 w-7" />}
              </div>
              <h2 className="mt-4 font-display text-xl font-semibold text-ocean-950">
                {isCancelled
                  ? 'This reel was cancelled'
                  : rank >= 3
                  ? 'Final review in progress'
                  : rank === 2
                  ? 'Your reel is being edited'
                  : 'Footage received'}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                {isCancelled
                  ? 'Reach out if you have any questions about this order.'
                  : rank >= 3
                  ? "We're giving your reel a final look. You'll be able to watch and download it here the moment it's approved."
                  : rank === 2
                  ? "Our editors are cutting your footage now. We'll email you the moment it's ready."
                  : "Thanks — we've got your footage and brief. Editing starts shortly."}
              </p>
            </section>
          )}

          {/* ── Submitted footage ──────────────────────────────────────────── */}
          <section className="card p-6">
            <h2 className="mb-4 font-semibold">Your footage ({footage.length})</h2>
            {footage.length === 0 ? (
              <p className="text-sm text-slate-500">No footage on file for this reel.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {footage.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2.5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                      <Film className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ocean-950">{f.filename}</div>
                      <div className="text-xs text-slate-500">
                        {fmtBytes(f.byte_size)}
                        {fmtDur(f.duration_seconds) ? ` · ${fmtDur(f.duration_seconds)}` : ''}
                        {f.role ? ` · ${f.role}` : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── Sidebar: timeline + brief ────────────────────────────────────── */}
        <div className="space-y-6">
          {!isCancelled && (
            <section className="card p-6">
              <h2 className="mb-4 font-semibold">Progress</h2>
              <ol className="space-y-4">
                {steps.map((s) => (
                  <li key={s.label} className="flex items-center gap-3">
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                        s.done
                          ? 'bg-emerald-100 text-emerald-700'
                          : s.active
                          ? 'bg-ocean-100 text-ocean-700'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {s.done ? (
                        <Check className="h-4 w-4" />
                      ) : s.active ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CircleDashed className="h-4 w-4" />
                      )}
                    </span>
                    <span
                      className={`text-sm ${
                        s.done || s.active ? 'font-medium text-ocean-950' : 'text-slate-400'
                      }`}
                    >
                      {s.label}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="card p-6">
            <h2 className="mb-4 font-semibold">Brief</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Type">{reelLabel}</Row>
              <Row label="Aspect">{aspectLabel}</Row>
              <Row label="Target length">{brief?.length_target_s ? `${brief.length_target_s}s` : '—'}</Row>
              <Row label="Captions">{brief?.captions ? 'Yes' : 'No'}</Row>
              <Row label="Music">{brief?.music ? 'Yes' : 'No'}</Row>
              <Row label="Lower-third">{brief?.lower_third ? 'Yes' : 'No'}</Row>
              <Row label="Subject">{brief?.subject_name || '—'}</Row>
              <Row label="Title">{brief?.subject_title || '—'}</Row>
            </dl>
          </section>
        </div>
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-ocean-950">{children}</dd>
    </div>
  );
}
