import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';

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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const orderId = session.metadata?.order_id as string | undefined;
    if (orderId) {
      const supabase = createAdminClient();
      // Idempotent: only stamp if not already paid.
      await supabase
        .from('orders')
        .update({
          download_paid_at: new Date().toISOString(),
          download_paid_cents: session.amount_total ?? null,
          download_stripe_session_id: session.id,
        })
        .eq('id', orderId)
        .is('download_paid_at', null);
    }
  }

  return NextResponse.json({ received: true });
}
