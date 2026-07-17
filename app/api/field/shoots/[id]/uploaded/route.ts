import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Contractor marks their own shoot's RAWs as uploaded. Ownership + the
 *  allowed status transition are enforced inside mark_field_shoot_uploaded(). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { error } = await supabase.rpc('mark_field_shoot_uploaded', { p_order_id: params.id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
