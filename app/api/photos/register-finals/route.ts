import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Registers finished photos that were edited outside the platform (Fotello)
 * and uploaded directly from the browser to the processed-photos bucket
 * (bypassing Vercel's request-body limit, same as photo register). Each file
 * becomes a kind='processed' photo row — immediately visible in Review & Edit
 * and deliverable through the existing gallery flow.
 */
const Body = z.object({
  order_id: z.string().uuid(),
  files: z.array(
    z.object({
      photo_id: z.string().uuid(),
      filename: z.string().min(1),
      storage_path: z.string().min(1),
      mime_type: z.string().optional().default('image/jpeg'),
      byte_size: z.number().int().nonnegative(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    })
  ),
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
  const { order_id, files } = parsed.data;
  if (files.length === 0) return NextResponse.json({ error: 'no_files' }, { status: 400 });

  const rows = files.map((f) => ({
    id: f.photo_id,
    order_id,
    kind: 'processed' as const,
    storage_path: f.storage_path,
    bucket: 'processed-photos',
    filename: f.filename,
    mime_type: f.mime_type,
    byte_size: f.byte_size,
    width: f.width ?? null,
    height: f.height ?? null,
    processing_status: 'complete' as const,
    ai_provider: 'fotello',
    uploaded_by: user.id,
  }));

  const { error: insErr } = await supabase.from('photos').insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Finals arriving means the order is past processing.
  await supabase
    .from('orders')
    .update({ status: 'ready' })
    .eq('id', order_id)
    .in('status', ['uploaded', 'processing', 'editing']);

  return NextResponse.json({ registered: rows.length });
}
