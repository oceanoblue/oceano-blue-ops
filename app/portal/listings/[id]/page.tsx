import { RescheduleAppointment } from '@/components/portal/RescheduleAppointment';
import { rescheduleEligibility } from '@/lib/booking/reschedule';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { Download, ImageOff } from 'lucide-react';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fmtAddress, STATUS_LABEL } from '@/lib/utils/format';
import { ClientGalleryGrid } from '@/components/gallery/ClientGalleryGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PortalHero } from '@/components/portal/PortalHero';
import { NotAClient } from '@/components/portal/NotAClient';
import { requireClientIds } from '@/lib/portal/require-client';
import { MediaRoom, type DeliverableView } from '@/components/portal/MediaRoom';
import { toEmbedUrl } from '@/lib/deliverables/embed';
import { paywallFor } from '@/lib/payments/gate';
import { isDeliverable } from '@/lib/photos/deliverable';

export const dynamic = 'force-dynamic';

export default async function ClientListingDetail(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/portal');

  // Client-only, scoped to their own client ids (never just RLS).
  const clientIds = await requireClientIds(supabase, user.id);
  if (clientIds.length === 0) return <NotAClient />;

  const { data: listing } = await supabase
    .from('listings')
    .select('id, address_line1, address_line2, city, state, zip, bedrooms, bathrooms, sqft, status')
    .eq('id', params.id)
    .in('client_id', clientIds)
    .maybeSingle();
  if (!listing) notFound();

  const l = listing as any;

  const { data: orders } = await supabase
    .from('orders')
    .select('id, status, scheduled_at, delivered_at, order_number, total_cents, download_paid_at, photographer_id')
    .eq('listing_id', params.id)
    .in('client_id', clientIds)
    .order('created_at', { ascending: false });

  const unlockedIds = (orders ?? []).filter(o => !paywallFor(o).active).map(o => o.id);
  const admin = createAdminClient({ noStore: true });
  const { data: scheduling } = await (admin as any).from('business_settings').select('client_rescheduling_enabled,client_reschedule_cutoff_hours,default_timezone').eq('id', true).single();
  // Read existing links only after client/listing ownership has been verified.
  const { data: links } = orders?.length ? await admin.from('delivery_links')
    .select('order_id, token, expires_at').in('order_id', orders.map(o => o.id))
    .order('created_at', { ascending: false }) : { data: [] };
  const galleryLinks = new Map<string, string>();
  for (const link of links ?? []) {
    if ((!link.expires_at || new Date(link.expires_at) > new Date()) && !galleryLinks.has(link.order_id)) {
      galleryLinks.set(link.order_id, `/gallery/${encodeURIComponent(link.token)}`);
    }
  }

  const { data: photos } = unlockedIds.length ? await supabase
    .from('photos')
    .select('id, filename, bucket, storage_path, width, height, sort_order, is_hdr, ai_provider')
    .in('order_id', unlockedIds)
    .in('kind', ['processed', 'delivered'])
    .eq('is_selected', true)
    .order('sort_order', { ascending: true }) : { data: [] };

  // Sign URLs server-side (private bucket)
  const signed = await Promise.all(
    (photos ?? []).filter(isDeliverable).map(async (p: any) => {
      const { data } = await supabase.storage.from(p.bucket).createSignedUrl(p.storage_path, 3600);
      return { id: p.id, filename: p.filename, width: p.width, height: p.height, url: data?.signedUrl ?? null };
    })
  );

  // Published non-photo deliverables (video / 360 tour / floor plan). RLS
  // returns only PUBLISHED items for listings this client owns; file URLs are
  // signed via the admin client after that ownership check.
  const { data: dvRows } = unlockedIds.length ? await supabase
    .from('listing_deliverables')
    .select('id, kind, title, source, external_url, bucket, storage_path, filename, mime_type')
    .eq('listing_id', params.id)
    .in('order_id', unlockedIds)
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true }) : { data: [] };

  const deliverables: DeliverableView[] = await Promise.all(
    (dvRows ?? []).map(async (d: any) => {
      let url: string | null = d.external_url ?? null;
      if (d.source === 'file' && d.bucket && d.storage_path) {
        const { data } = await admin.storage.from(d.bucket).createSignedUrl(d.storage_path, 3600);
        url = data?.signedUrl ?? null;
      }
      return {
        id: d.id,
        kind: d.kind,
        title: d.title,
        source: d.source,
        url,
        embedUrl: d.source === 'url' && d.external_url ? toEmbedUrl(d.external_url) : null,
        mime: d.mime_type,
        filename: d.filename,
      } satisfies DeliverableView;
    })
  );

  const latest = (orders?.[0] as any) ?? null;
  const metaLine = `${l.bedrooms ?? '—'} bd · ${l.bathrooms ?? '—'} ba · ${
    l.sqft ? l.sqft.toLocaleString() : '—'
  } sqft`;

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHero
        eyebrow="Listing"
        title={fmtAddress(l)}
        subtitle={metaLine}
        backHref="/portal/listings"
        backLabel="All listings"
      >
        {latest && <StatusBadge status={latest.status} />}
        {signed.length > 0 && (
          <Link
            href={`/api/portal/zip?listing_id=${l.id}`}
            prefetch={false}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-ink-900 shadow-soft transition hover:-translate-y-px hover:shadow-lift"
          >
            <Download className="h-4 w-4" /> Download all
          </Link>
        )}
      </PortalHero>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <section className="mb-8 space-y-3" aria-label="Your orders">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Your orders</h2><Link className="btn-secondary" href="/book">Book another shoot</Link></div>
          {(orders ?? []).map(o => <div key={o.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-medium">Order #{o.order_number}</p><p className="mt-1 text-sm text-slate-600">{paywallFor(o).active ? 'Payment required to unlock downloads' : o.download_paid_at ? 'Paid · Downloads unlocked' : 'No payment required'}</p></div>
            {galleryLinks.has(o.id) ? <Link href={galleryLinks.get(o.id)!} className="btn-primary">{paywallFor(o).active ? 'View gallery & pay' : 'Open gallery'}</Link> : <p className="text-sm text-slate-500">{paywallFor(o).active ? 'Contact us for your payment link.' : 'Gallery link will appear when ready.'}</p>}
            {o.scheduled_at && ['booked','scheduled'].includes(o.status) && <RescheduleAppointment orderId={o.id} scheduledAt={o.scheduled_at} timezone={scheduling?.default_timezone || 'America/New_York'} cutoff={scheduling?.client_reschedule_cutoff_hours ?? 48} reason={scheduling ? rescheduleEligibility(o, scheduling) : 'Contact us to change your appointment.'} />}
          </div>)}
        </section>
        {signed.length > 0 ? (
          <>
            <div className="mb-4 text-sm text-slate-600">
              {signed.length} photo{signed.length === 1 ? '' : 's'} ready to download.
            </div>
            <ClientGalleryGrid photos={signed} />
          </>
        ) : deliverables.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={ImageOff}
              title={(orders ?? []).some(o => paywallFor(o).active) ? 'Downloads locked until payment' : 'Photos in progress'}
              description={
                <>
                  {(orders ?? []).some(o => paywallFor(o).active) ? 'Open your order gallery above to preview and pay. Current status: ' : "We'll email you the moment your gallery is ready. Current status: "}
                  <strong>{latest ? STATUS_LABEL[latest.status] : 'no orders yet'}</strong>.
                </>
              }
            />
          </div>
        ) : null}

        <MediaRoom items={deliverables} />
      </main>
    </div>
  );
}
