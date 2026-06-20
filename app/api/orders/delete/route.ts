import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { deleteOrderCompletely } from '@/lib/orders/delete-order';

export const dynamic = 'force-dynamic';

/**
 * Permanently delete an entire order (all storage objects + the order row and
 * its cascading children). Owner action, used by the "Delete order" control for
 * junk: duplicate uploads, empty/test orders. Supports dry_run to preview.
 */
const Body = z.object({
  order_id: z.string().uuid(),
  dry_run: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await deleteOrderCompletely(parsed.data.order_id, { dryRun: parsed.data.dry_run });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'delete_failed' }, { status: 500 });
  }
}
