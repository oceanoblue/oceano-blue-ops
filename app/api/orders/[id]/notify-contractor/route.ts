import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createPhotoIntakeRequest } from '@/lib/integrations/dropbox';
import { sendEmail } from '@/lib/email/resend';
import { contractorAssignmentEmail } from '@/lib/email/templates';

/**
 * Office action: email the assigned contractor their shoot + a one-tap Dropbox
 * upload link. Ensures the Dropbox folder/link exists first. Team-only.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Team gate — this route reads via the admin client, so verify staff here.
  const { data: teamRow } = await admin
    .from('team_members')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!teamRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: order } = await admin
    .from('orders')
    .select('id, order_number, contractor_id, dropbox_intake_url, dropbox_intake_path, listings(address_line1, city, state, zip, sqft), internal_notes')
    .eq('id', params.id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  if (!order.contractor_id) {
    return NextResponse.json({ error: 'no_contractor_assigned' }, { status: 400 });
  }

  const { data: contractor } = await admin
    .from('contractors')
    .select('email, full_name')
    .eq('id', order.contractor_id)
    .maybeSingle();
  if (!contractor) return NextResponse.json({ error: 'contractor_not_found' }, { status: 404 });

  const listing = (order.listings ?? {}) as any;
  const addr = listing.address_line1 || `Order #${order.order_number}`;

  // Ensure a Dropbox upload link exists (create once, persist).
  let uploadUrl = order.dropbox_intake_url as string | null;
  if (!uploadUrl) {
    const slug = [listing.address_line1, listing.city].filter(Boolean).join(' ') || `order-${order.order_number}`;
    const result = await createPhotoIntakeRequest(
      order.order_number,
      slug,
      `RAW photos — ${addr} (Oceano Blue)`
    );
    if (result.status === 'not_configured') {
      return NextResponse.json({ error: 'dropbox_not_configured' }, { status: 501 });
    }
    if (result.status === 'failed') {
      return NextResponse.json({ error: `dropbox: ${result.error}` }, { status: 502 });
    }
    uploadUrl = result.url;
    await admin
      .from('orders')
      .update({ dropbox_intake_url: result.url, dropbox_intake_path: result.path })
      .eq('id', params.id);
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const { subject, html } = contractorAssignmentEmail({
    contractorName: contractor.full_name,
    address: addr,
    cityStateZip: [listing.city, listing.state, listing.zip].filter(Boolean).join(', '),
    sqft: listing.sqft,
    services: order.internal_notes,
    uploadUrl: uploadUrl!,
    portalUrl: `${base}/field/shoots/${order.id}`,
  });

  const sent = await sendEmail({ to: contractor.email, subject, html });
  if (sent.status === 'not_configured') {
    return NextResponse.json({ error: 'email_not_configured' }, { status: 501 });
  }
  if (sent.status === 'failed') {
    return NextResponse.json({ error: sent.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, to: contractor.email });
}
