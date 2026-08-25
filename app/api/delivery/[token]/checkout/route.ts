import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getStripe, getBaseUrl, isStripeConfigured } from '@/lib/stripe/server';

export const dynamic = 'force-dynamic';

/**
 * Starts a Stripe Checkout session to unlock downloads for the order behind
 * this gallery token. Public — the token itself is the capability. Returns
 * { url } to redirect the buyer to Stripe's hosted checkout.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const stripe = getStripe();
  if (!isStripeConfigured() || !stripe) {
    return NextResponse.json({ error: 'payments_unavailable' }, { status: 503 });
  }

  const supabase = createAdminClient();
  const { data: link } = await supabase
    .from('delivery_links')
    .select('id, order_id, expires_at')
    .eq('token', params.token)
    .single();
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, total_cents, download_paid_at, listing_id')
    .eq('id', link.order_id)
    .single();
  if (!order) return NextResponse.json({ error: 'order_missing' }, { status: 404 });
  if (order.download_paid_at) return NextResponse.json({ paid: true });

  const { data: items } = await supabase
    .from('order_items')
    .select('description, quantity, unit_price_cents, total_cents')
    .eq('order_id', order.id);

  const itemsSum = (items ?? []).reduce((s: number, i: any) => s + (i.total_cents ?? 0), 0);
  const priceCents = order.total_cents && order.total_cents > 0 ? order.total_cents : itemsSum;
  if (!priceCents || priceCents <= 0) {
    return NextResponse.json({ error: 'no_price_set' }, { status: 400 });
  }

  // Build itemized line items from the order's products when available, so the
  // buyer sees exactly what they're paying for; otherwise a single line.
  const lineItems =
    (items ?? []).length > 0
      ? (items ?? []).map((i: any) => ({
          quantity: i.quantity ?? 1,
          price_data: {
            currency: 'usd',
            unit_amount: i.unit_price_cents ?? 0,
            product_data: { name: i.description || 'Listing media' },
          },
        }))
      : [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: priceCents,
              product_data: { name: `Listing media — Order #${order.order_number}` },
            },
          },
        ];

  const base = getBaseUrl(req);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    // Reconcile in the webhook by order id; token lets us log the source link.
    metadata: { order_id: order.id, token: params.token },
    success_url: `${base}/gallery/${params.token}?paid=1`,
    cancel_url: `${base}/gallery/${params.token}`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
