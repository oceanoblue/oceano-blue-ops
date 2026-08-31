import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createPhotoIntakeRequest } from '@/lib/integrations/dropbox';

/**
 * Create (once) the Dropbox upload link for a contractor's OWN shoot. Ownership
 * is enforced by RLS: the session-scoped read only returns the order if it
 * belongs to the signed-in contractor. The Dropbox call + write-back then use
 * the admin client (contractors have no write grant on orders).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Contractor-safe view (0070) returns this row only if it's the caller's own
  // shoot; it carries no pricing columns. `listing` is a nested object.
  const { data: order } = await supabase
    .from('field_orders')
    .select('id, order_number, dropbox_intake_url, dropbox_intake_path, listing')
    .eq('id', params.id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (order.dropbox_intake_url) {
    return NextResponse.json({
      url: order.dropbox_intake_url,
      path: order.dropbox_intake_path,
      existing: true,
    });
  }

  const listing = order.listing as any;
  // order_number is NOT NULL on the base table; the view just widens it to
  // nullable. Non-null asserted so the Dropbox helper gets a concrete number.
  const orderNumber = order.order_number!;
  const addr = [listing?.address_line1, listing?.city].filter(Boolean).join(' ');
  const result = await createPhotoIntakeRequest(
    orderNumber,
    addr || `order-${orderNumber}`,
    `RAW photos — ${addr || `Order #${orderNumber}`} (Oceano Blue)`
  );

  if (result.status === 'not_configured') {
    return NextResponse.json({ error: 'dropbox_not_configured' }, { status: 501 });
  }
  if (result.status === 'failed') {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const admin = createAdminClient();
  const { error: upErr } = await admin
    .from('orders')
    .update({ dropbox_intake_url: result.url, dropbox_intake_path: result.path })
    .eq('id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ url: result.url, path: result.path, existing: false });
}
