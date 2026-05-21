import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Flip the `is_selected` flag on a processed photo. Used by the
 * Approve / Reject buttons on the review grid.
 *
 * `is_selected = true` means "this is one of the keepers for delivery."
 * The DeliveryControl bundles only is_selected photos when generating the
 * client gallery zip.
 */
const Body = z.object({
  photo_id: z.string().uuid(),
  decision: z.enum(['approve', 'reject', 'reset']),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const newValue =
    parsed.data.decision === 'approve' ? true : parsed.data.decision === 'reject' ? false : null;

  const { error } = await admin
    .from('photos')
    .update({ is_selected: newValue })
    .eq('id', parsed.data.photo_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, is_selected: newValue });
}
