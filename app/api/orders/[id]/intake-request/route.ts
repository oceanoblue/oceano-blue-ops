import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createPhotoIntakeRequest } from '@/lib/integrations/dropbox';

/**
 * Creates (once) the Dropbox file-request link a contractor photographer uses
 * to upload RAWs for this order. Idempotent: if the order already has a link,
 * it is returned instead of creating a duplicate request.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: isTeam } = await supabase.rpc('is_team_member');
  if (!isTeam) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, order_number, dropbox_intake_url, dropbox_intake_path, listings(address_line1, city)')
    .eq('id', params.id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 });

  if (order.dropbox_intake_url) {
    return NextResponse.json({
      url: order.dropbox_intake_url,
      path: order.dropbox_intake_path,
      existing: true,
    });
  }

  const listing = order.listings as any;
  const addr = [listing?.address_line1, listing?.city].filter(Boolean).join(' ');
  const result = await createPhotoIntakeRequest(
    order.order_number,
    addr || `order-${order.order_number}`,
    `RAW photos — ${addr || `Order #${order.order_number}`} (Oceano Blue)`
  );

  if (result.status === 'not_configured') {
    return NextResponse.json(
      {
        error: 'dropbox_not_configured',
        hint: 'Set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN in the environment.',
      },
      { status: 501 }
    );
  }
  if (result.status === 'failed') {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const { error: upErr } = await admin
    .from('orders')
    .update({ dropbox_intake_url: result.url, dropbox_intake_path: result.path })
    .eq('id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ url: result.url, path: result.path, existing: false });
}
