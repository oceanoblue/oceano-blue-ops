import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Contractor undoes an accidental "I've uploaded everything" — reverts the
 *  shoot from 'uploaded' back to 'shooting'. Ownership + the (uploaded-only)
 *  transition are enforced inside unmark_field_shoot_uploaded(). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { error } = await supabase.rpc('unmark_field_shoot_uploaded', { p_order_id: params.id });
  if (error) {
    const msg = /order_not_revertable/.test(error.message)
      ? 'This shoot is already being processed by the office — ask them to reset it.'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
