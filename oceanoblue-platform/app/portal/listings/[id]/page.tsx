import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { fmtAddress, STATUS_LABEL, STATUS_COLOR } from '@/lib/utils/format';
import { ClientGalleryGrid } from '@/components/gallery/ClientGalleryGrid';

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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <Link href="/portal/listings" className="text-sm text-ocean-700 hover:underline">← All listings</Link>
          <div className="mt-2 flex items-start justify-between gap-3">
            <h1 className="text-xl font-semibold text-ocean-950">{fmtAddress(l)}</h1>
            {orders?.[0] && (
              <span className={`pill ${STATUS_COLOR[(orders[0] as any).status]}`}>
                {STATUS_LABEL[(orders[0] as any).status]}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {l.bedrooms ?? '—'} bd · {l.bathrooms ?? '—'} ba · {l.sqft ?? '—'} sqft
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {signed.length === 0 ? (
          <div className="card p-12 text-center">
            <h2 className="text-lg font-semibold">Photos in progress</h2>
            <p className="mt-2 text-sm text-slate-600">
              We'll email you the moment delivery is ready. Status:{' '}
              <strong>{orders?.[0] ? STATUS_LABEL[(orders[0] as any).status] : 'no orders'}</strong>.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-slate-600">{signed.length} photo{signed.length === 1 ? '' : 's'} ready</div>
              <Link
                href={`/api/portal/zip?listing_id=${l.id}`}
                className="btn-primary"
                prefetch={false}
              >
                <Download className="h-4 w-4" /> Download all
              </Link>
            </div>
            <ClientGalleryGrid photos={signed} />
          </>
        )}
      </main>
    </div>
  );
}
