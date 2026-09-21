import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { captureError } from '@/lib/observability/report';

export const dynamic = 'force-dynamic';
// Stripe needs the raw, unparsed body to verify the signature.
export const runtime = 'nodejs';

/**
 * Stripe webhook. On checkout.session.completed we stamp the order as paid,
 * which unlocks downloads everywhere that order's media is served. Verifies the
 * signature with STRIPE_WEBHOOK_SECRET — unsigned/forged calls are rejected.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'webhook_unconfigured' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'no_signature' }, { status: 400 });

  const raw = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `invalid_signature: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 400 }
    );
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    // Checkout can complete while a delayed payment is still pending. Only
    // settlement (or a fully discounted checkout) may unlock the downloads.
    if (session.mode !== 'payment' || !['paid', 'no_payment_required'].includes(session.payment_status)) {
      return NextResponse.json({ received: true });
    }
    const orderId = session.metadata?.order_id;
    if (orderId) {
      const supabase = createAdminClient();
      // The transaction shares a row lock with invoice editing. Older checkouts
      // are retained in the office review queue instead of unlocking a new bill.
      const { error } = await (supabase as any).rpc('settle_order_checkout', {
        p_order_id: orderId,
        p_session_id: session.id,
        p_amount_cents: session.amount_total ?? 0,
        p_revision: Number(session.metadata?.services_revision ?? 0),
      });
      if (error) {
        captureError('stripe.paymentPersistence', error, { eventId: event.id, orderId });
        // Stripe retries non-2xx responses. Acknowledging here would permanently
        // lose the payment notification and leave the customer's downloads locked.
        return NextResponse.json({ error: 'payment_persistence_failed' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
