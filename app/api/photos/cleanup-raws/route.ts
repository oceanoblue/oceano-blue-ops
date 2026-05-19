import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { cleanupOrderRaws } from '@/lib/photos/cleanup-raws';

/**
 * Manual cleanup: delete the camera-RAW originals (ARW / CR2 / etc) for a
 * single order. Used by the "Delete RAW originals" button on the order page.
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
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const result = await cleanupOrderRaws(parsed.data.order_id, {
      dryRun: parsed.data.dry_run,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'cleanup_failed' },
      { status: 500 }
    );
  }
}
