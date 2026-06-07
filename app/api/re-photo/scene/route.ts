import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { SCENE_TYPES } from '@/lib/photos/scene';

export const dynamic = 'force-dynamic';

/**
 * Real Estate Photo Rescue v2 — manual scene override.
 * A human picks a scene category in the review UI; we merge it into
 * assets.metadata with scene_source = 'manual'.
 */
const Body = z.object({
  asset_id: z.string().uuid(),
  scene: z.enum(SCENE_TYPES),
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
  const { asset_id, scene } = parsed.data;
  const admin = createAdminClient() as any;

  const { data: asset } = await admin.from('assets').select('metadata').eq('id', asset_id).maybeSingle();
  if (!asset) return NextResponse.json({ error: 'asset_not_found' }, { status: 404 });

  const metadata = { ...(asset.metadata ?? {}), scene, scene_source: 'manual' };
  const { error } = await admin.from('assets').update({ metadata }).eq('id', asset_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, scene });
}
