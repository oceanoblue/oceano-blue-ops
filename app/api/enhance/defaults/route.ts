import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { loadFinishDefaults } from '@/lib/ai/finish-settings';
import { FinishDefaultsSchema } from '@/lib/ai/finishing';

async function staff() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return false;
  const { data } = await db.rpc('is_team_member');
  return !!data;
}
export async function GET() {
  if (!await staff()) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json(await loadFinishDefaults());
}
export async function PUT(request: Request) {
  if (!await staff()) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const parsed = FinishDefaultsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid_defaults' }, { status: 400 });
  const { error } = await createAdminClient().from('oceano_enhance_settings').upsert({
    id: true, finish_defaults: parsed.data, updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: 'defaults_save_failed' }, { status: 500 });
  return NextResponse.json(parsed.data);
}
