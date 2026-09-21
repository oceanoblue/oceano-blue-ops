import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createClient } from '@/lib/supabase/server';
import { serviceEditSchema } from '@/lib/orders/service-pricing';

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const gate = await requireTeamMember();
  if (gate.error) return gate.error;
  const { id } = await props.params;
  const parsed = serviceEditSchema.safeParse(await req.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ error: 'Check the service names, quantities, prices, and square footage.' }, { status: 400 });
  }
  const body = parsed.data;
  const client = await createClient();
  const { data, error } = await (client as any).rpc('edit_order_services', {
    p_order_id: id, p_expected_updated_at: body.expected_updated_at,
    p_items: body.items, p_sqft: body.sqft, p_expected_sqft: body.expected_sqft,
    p_adjustment_cents: body.adjustment_cents,
  });
  if (error) {
    const messages: Record<string, string> = {
      order_changed: 'This order changed while you were editing. Refresh and try again.',
      property_changed: 'The property size changed while you were editing. Refresh and try again.',
      order_paid: 'This order is already paid. Create a separate order for additional services.',
      payment_needs_review: 'A payment needs office review before this invoice can be changed.',
      forbidden: 'Only team members can edit services.',
      invalid_product: 'A selected service is no longer available. Refresh and try again.',
    };
    const key = Object.keys(messages).find(k => error.message.includes(k));
    return NextResponse.json({ error: key ? messages[key] : 'Services could not be saved. Refresh and try again.' }, { status: key === 'forbidden' ? 403 : 409 });
  }
  return NextResponse.json(data);
}
