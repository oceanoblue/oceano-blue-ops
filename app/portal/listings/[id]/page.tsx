import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { Download, ImageOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fmtAddress, STATUS_LABEL } from '@/lib/utils/format';
import { ClientGalleryGrid } from '@/components/gallery/ClientGalleryGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PortalHero } from '@/components/portal/PortalHero';

export const dynamic = 'force-dynamic';

export default async function ClientListingDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/portal');

  const { data: listing } = await supabase
    .from('listings')
    .select('id, address_line1, address_line2, city, state, zip, bedrooms, bathrooms, sqft, status')
    .eq('id', params.id)
    .maybeSingle();
  if (!listing) notFound();

  const l = listing as any;

  const { data: orders } = await supabase
    .from('orders')
    .select('id, status, scheduled_at, delivered_at, order_number')
    .eq('listing_id', params.id)
    .order('created_at', { ascending: false });

  const { data: photos } = await supabase
    .from('photos')
    .select('id, filename, bucket, storage_path, width, height, sort_order')
    .in(
      'order_id',
      (orders ?? []).map((o: any) => o.id)
    )
    .in('kind', ['processed', 'delivered'])
    .eq('is_selected', true)
    .order('sort_order', { ascending: true });

  // Sign URLs server-side (private bucket)
  const signed = await Promise.all(
    (photos ?? []).map(async (p: any) => {
      const { data } = await supabase.storage.from(p.bucket).createSignedUrl(p.storage_path, 3600);
      return { id: p.id, filename: p.filename, width: p.width, height: p.height, url: data?.signedUrl ?? null };
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
        {signed.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={ImageOff}
              title="Photos in progress"
              description={
                <>
                  We&apos;ll email you the moment your gallery is ready. Current status:{' '}
                  <strong>{latest ? STATUS_LABEL[latest.status] : 'no orders yet'}</strong>.
                </>
              }
            />
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-slate-600">
              {signed.length} photo{signed.length === 1 ? '' : 's'} ready to download.
            </div>
            <ClientGalleryGrid photos={signed} />
          </>
        )}
      </main>
    </div>
  );
}
