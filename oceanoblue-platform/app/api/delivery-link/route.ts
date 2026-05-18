import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { generateDeliveryToken } from '@/lib/utils/delivery-token';

const Body = z.object({
  order_id: z.string().uuid(),
  expires_at: z.string().datetime().optional(),
});

/** Generate a new delivery link for an order. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const token = generateDeliveryToken();
  const { data, error } = await supabase
    .from('delivery_links')
    .insert({
      order_id: parsed.data.order_id,
      token,
      expires_at: parsed.data.expires_at,
      created_by: user.id,
    })
    .select('id, token')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', parsed.data.order_id);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return NextResponse.json({ id: data.id, token: data.token, url: `${base}/gallery/${data.token}` });
}
